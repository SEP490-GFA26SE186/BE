// So cai credit cho mot yeu cau AI. Moi ham nhan `tx` (client transaction Prisma) va phai duoc goi
// TRONG transaction do; khoa dong bang `FOR UPDATE` chi co tac dung den khi transaction ket thuc.
//
// Quy uoc (spec 8.1): credit_hold = -cost, credit_release = +cost, credit_consume = 0 (dong danh dau).
// Giu bat bien wallets.credit_balance = tong amount cua ledger `credit`.
// Idempotent: dong ledger co key da ton tai -> khong lam gi (unique idempotency_key la chot chan cuoi).
import { StatusCodes } from 'http-status-codes';
import ApiError from '../../utils/ApiError.js';

const KINDS = {
  hold: { entryType: 'credit_hold', sign: -1 },
  release: { entryType: 'credit_release', sign: 1 },
  consume: { entryType: 'credit_consume', sign: 0 },
};

export const ledgerKey = (aiRequestId, kind) => `ai:${aiRequestId}:${kind}`;

/** Thuan: dong ledger cho mot buoc cua yeu cau AI. `amount` la so credit duong (bo qua voi consume). */
export function buildLedgerRow(kind, { userId, amount = 0, balanceAfter, aiRequestId }) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`Loại sổ cái không hợp lệ: ${kind}`);
  return {
    userId,
    walletType: 'credit',
    entryType: spec.entryType,
    amount: BigInt(amount) * BigInt(spec.sign),
    balanceAfter: BigInt(balanceAfter),
    idempotencyKey: ledgerKey(aiRequestId, kind),
    refType: 'ai_request',
    refId: aiRequestId,
  };
}

function assertAmount(amount) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw ApiError.internal('Số credit phải là số nguyên dương');
  }
}

const insufficient = () => new ApiError(StatusCodes.PAYMENT_REQUIRED, 'Không đủ credit');

async function lockWallet(tx, userId) {
  const rows = await tx.$queryRaw`SELECT credit_balance FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;
  return rows.length ? Number(rows[0].credit_balance) : null;
}

async function alreadyRecorded(tx, aiRequestId, kind) {
  const existing = await tx.walletLedger.findUnique({
    where: { idempotencyKey: ledgerKey(aiRequestId, kind) },
    select: { id: true },
  });
  return Boolean(existing);
}

async function apply(tx, kind, { userId, amount = 0, aiRequestId }) {
  // Khoa truoc, kiem key sau: hai lan goi dong thoi cung key se xep hang o khoa, lan sau thay dong cua lan truoc.
  const balance = await lockWallet(tx, userId);
  if (balance === null) {
    if (kind === 'hold') throw insufficient();
    throw ApiError.internal('Không tìm thấy ví');
  }
  if (await alreadyRecorded(tx, aiRequestId, kind)) return;

  const balanceAfter = balance + KINDS[kind].sign * amount;
  if (balanceAfter < 0) throw insufficient();

  if (balanceAfter !== balance) {
    await tx.wallet.update({ where: { userId }, data: { creditBalance: balanceAfter } });
  }
  await tx.walletLedger.create({ data: buildLedgerRow(kind, { userId, amount, balanceAfter, aiRequestId }) });
}

export async function holdCredit(tx, { userId, amount, aiRequestId }) {
  assertAmount(amount);
  await apply(tx, 'hold', { userId, amount, aiRequestId });
}

export async function releaseCredit(tx, { userId, amount, aiRequestId }) {
  assertAmount(amount);
  await apply(tx, 'release', { userId, amount, aiRequestId });
}

export async function consumeCredit(tx, { userId, aiRequestId }) {
  await apply(tx, 'consume', { userId, aiRequestId });
}

// ---------------------------------------------------------------------------
// Cap / het han credit theo goi (rev8: goi cap credit moi thang, credit du het han cuoi thang).
// Key do nguoi goi dat (vd. `grant:<subscriptionId>:<n>`) — cung key goi lai khong ghi hai lan.
// ---------------------------------------------------------------------------

async function recorded(tx, key) {
  return Boolean(await tx.walletLedger.findUnique({ where: { idempotencyKey: key }, select: { id: true } }));
}

/** Cong `amount` credit (vi chua co thi tao). Tra so du moi, hoac null neu key da ghi. */
export async function grantCredit(tx, { userId, amount, key, refType = 'subscription', refId = null }) {
  if (!Number.isInteger(amount) || amount < 0) throw ApiError.internal('Số credit cấp phải là số nguyên không âm');
  await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  const balance = await lockWallet(tx, userId);
  if (await recorded(tx, key)) return null;
  const balanceAfter = balance + amount;
  if (amount > 0) await tx.wallet.update({ where: { userId }, data: { creditBalance: balanceAfter } });
  await tx.walletLedger.create({
    data: {
      userId, walletType: 'credit', entryType: 'credit_grant', amount: BigInt(amount),
      balanceAfter: BigInt(balanceAfter), idempotencyKey: key, refType, refId,
    },
  });
  return balanceAfter;
}

/** Xoa so credit con lai (credit_expire = -so du). So du 0 -> khong ghi gi. Tra so credit da xoa. */
export async function expireCredit(tx, { userId, key, refType = 'subscription', refId = null }) {
  const balance = await lockWallet(tx, userId);
  if (!balance || balance <= 0 || (await recorded(tx, key))) return 0;
  await tx.wallet.update({ where: { userId }, data: { creditBalance: 0 } });
  await tx.walletLedger.create({
    data: {
      userId, walletType: 'credit', entryType: 'credit_expire', amount: BigInt(-balance),
      balanceAfter: 0n, idempotencyKey: key, refType, refId,
    },
  });
  return balance;
}
