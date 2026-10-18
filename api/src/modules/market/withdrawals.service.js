// Rut doanh thu nguoi ban (rev8 luong 6) qua chi ho payOS.
// requested (giu tien: available -> locked) -> Admin duyet -> processing (lenh chi ho payOS) ->
// giao dich SUCCEEDED: paid (locked giam) | that bai: rejected (locked -> available). Nguoi ban huy khi con requested.
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { maskAccount, open, seal } from '../../utils/secretBox.js';
import { payosPayout } from '../../clients/payos.js';
import { moveEarning } from '../wallets/earningLedger.js';
import { loadMarketSettings } from '../billing/billing.store.js';

const TX = { timeout: 20000 };
const BANK_COOLDOWN_MS = 24 * 3_600_000; // DBML: chan rut tien 24 gio sau khi doi tai khoan
const vnd = (v) => (v == null ? null : Number(v));
const conflict = (m) => new ApiError(StatusCodes.CONFLICT, m);
const unprocessable = (m) => new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, m);

const formatWithdrawal = (w) => ({
  id: w.id,
  amountVnd: vnd(w.amountVnd),
  status: w.status,
  bank: { bankName: w.bankSnapshot?.bankName, accountNumber: w.bankSnapshot?.accountMasked, accountHolder: w.bankSnapshot?.accountHolder },
  rejectReason: w.rejectReason,
  handledAt: w.handledAt,
  createdAt: w.createdAt,
});

async function approvedSeller(userId) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (seller?.status !== 'approved') throw ApiError.forbidden('Chỉ người bán đã được duyệt mới rút tiền được.');
  return seller;
}

// ---------------------------------------------------------------------------
// Nguoi ban
// ---------------------------------------------------------------------------

/** PUT /sellers/me/bank — so tai khoan ma hoa khi luu; doi tai khoan -> chan rut tien 24 gio. */
export async function updateBank(user, { bankBin, bankName, accountNumber, accountHolder }) {
  await approvedSeller(user.id);
  const seller = await prisma.sellerProfile.update({
    where: { userId: user.id },
    data: { bankBin, bankName: bankName.trim(), bankAccountNumber: seal(accountNumber.trim()), bankAccountHolder: accountHolder.trim().toUpperCase(), bankUpdatedAt: new Date() },
  });
  return { bank: bankView(seller) };
}

function bankView(s) {
  if (!s.bankAccountNumber) return null;
  return { bankBin: s.bankBin, bankName: s.bankName, accountNumber: maskAccount(open(s.bankAccountNumber)), accountHolder: s.bankAccountHolder, updatedAt: s.bankUpdatedAt };
}

/** GET /sellers/me/earnings — so du doanh thu, tai khoan nhan, lich su rut, so cai gan day. */
export async function getEarnings(user) {
  const seller = await approvedSeller(user.id);
  const [wallet, withdrawals, ledger, settings] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: user.id } }),
    prisma.withdrawalRequest.findMany({ where: { sellerId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.walletLedger.findMany({ where: { userId: user.id, walletType: 'earning' }, orderBy: { id: 'desc' }, take: 30 }),
    loadMarketSettings(prisma),
  ]);
  return {
    balance: {
      pendingVnd: vnd(wallet?.earningPendingVnd ?? 0n),
      availableVnd: vnd(wallet?.earningAvailableVnd ?? 0n),
      lockedVnd: vnd(wallet?.earningLockedVnd ?? 0n),
    },
    sellerShareRate: settings.sellerShareRate,
    holdDays: settings.earningHoldDays,
    minWithdrawalVnd: settings.minWithdrawalVnd,
    bank: bankView(seller),
    withdrawals: withdrawals.map(formatWithdrawal),
    ledger: ledger.map((r) => ({ entryType: r.entryType, amountVnd: vnd(r.amount), availableAt: r.availableAt, createdAt: r.createdAt })),
  };
}

/** POST /sellers/me/withdrawals { amountVnd } — giu tien (available -> locked), cho Admin duyet. */
export async function requestWithdrawal(user, { amountVnd }, { now = new Date() } = {}) {
  const seller = await approvedSeller(user.id);
  const { minWithdrawalVnd } = await loadMarketSettings(prisma);
  if (!seller.bankAccountNumber || !seller.bankBin) throw unprocessable('Hãy nhập tài khoản ngân hàng nhận tiền trước.');
  if (seller.bankUpdatedAt && now - seller.bankUpdatedAt < BANK_COOLDOWN_MS) {
    throw unprocessable('Vừa đổi tài khoản ngân hàng: rút được sau 24 giờ kể từ lúc đổi.');
  }
  if (amountVnd < minWithdrawalVnd) throw unprocessable(`Số tiền rút tối thiểu là ${minWithdrawalVnd.toLocaleString('vi-VN')}đ.`);

  const created = await prisma.$transaction(async (tx) => {
    // Khoa ho so ban: hai yeu cau song song chay lan luot -> yeu cau sau thay yeu cau truoc. (Partial unique
    // cua DB chi chan `requested`, khong chan `processing`.)
    await tx.$queryRaw`SELECT user_id FROM seller_profiles WHERE user_id = ${user.id}::uuid FOR UPDATE`;
    const unfinished = await tx.withdrawalRequest.findFirst({ where: { sellerId: user.id, status: { in: ['requested', 'processing'] } } });
    if (unfinished) throw conflict('Đang có một yêu cầu rút tiền chưa xử lý xong.');
    const w = await tx.withdrawalRequest.create({
      data: {
        sellerId: user.id,
        amountVnd: BigInt(amountVnd),
        bankSnapshot: { bankBin: seller.bankBin, bankName: seller.bankName, accountSealed: seller.bankAccountNumber, accountMasked: maskAccount(openSafe(seller.bankAccountNumber)), accountHolder: seller.bankAccountHolder },
      },
    });
    const wallet = await tx.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet || wallet.earningAvailableVnd < BigInt(amountVnd)) throw unprocessable('Số dư có thể rút không đủ.');
    await moveEarning(tx, {
      userId: user.id, entryType: 'withdrawal_hold', amount: -BigInt(amountVnd),
      delta: { earningAvailableVnd: -BigInt(amountVnd), earningLockedVnd: BigInt(amountVnd) },
      key: `withdraw_hold:${w.id}`, refType: 'withdrawal', refId: w.id,
    });
    return w;
  }, TX);
  return { withdrawal: formatWithdrawal(created) };
}

const openSafe = (sealed) => {
  try {
    return open(sealed);
  } catch {
    return null;
  }
};

/** Tra lai tien da giu (huy / tu choi / chi ho that bai). */
async function release(tx, w, status, { by = null, reason = null, now = new Date() } = {}) {
  const { count } = await tx.withdrawalRequest.updateMany({
    where: { id: w.id, status: { in: ['requested', 'processing'] } },
    data: { status, handledBy: by, handledAt: now, rejectReason: reason },
  });
  if (count !== 1) return false;
  await moveEarning(tx, {
    userId: w.sellerId, entryType: 'withdrawal_release', amount: w.amountVnd,
    delta: { earningLockedVnd: -w.amountVnd, earningAvailableVnd: w.amountVnd },
    key: `withdraw_release:${w.id}`, refType: 'withdrawal', refId: w.id,
  });
  return true;
}

/** DELETE /sellers/me/withdrawals/:id — chi khi con requested (Admin chua duyet). */
export async function cancelWithdrawal(user, id) {
  const w = await prisma.withdrawalRequest.findFirst({ where: { id, sellerId: user.id } });
  if (!w) throw ApiError.notFound('Không tìm thấy yêu cầu rút tiền.');
  if (w.status !== 'requested') throw conflict('Yêu cầu đã được xử lý, không huỷ được.');
  await prisma.$transaction((tx) => release(tx, w, 'cancelled'), TX);
  return { withdrawal: formatWithdrawal(await prisma.withdrawalRequest.findUnique({ where: { id } })) };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listWithdrawals({ status = 'requested' } = {}) {
  const rows = await prisma.withdrawalRequest.findMany({
    where: { status },
    orderBy: { createdAt: 'asc' },
    include: { seller: { select: { displayName: true, user: { select: { email: true } } } } },
  });
  return rows.map((w) => ({ ...formatWithdrawal(w), seller: { userId: w.sellerId, displayName: w.seller.displayName, email: w.seller.user.email } }));
}

/**
 * Admin duyet -> tao lenh chi ho payOS (idempotency key = id yeu cau: bam duyet lai khong chi trung).
 * payOS tu choi ngay (sai tai khoan, het so du...) -> giu `requested` va bao loi de Admin xu ly.
 */
export async function approveWithdrawal(admin, id, { now = new Date() } = {}) {
  const w = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!w) throw ApiError.notFound('Không tìm thấy yêu cầu rút tiền.');
  if (w.status !== 'requested') throw conflict('Yêu cầu không còn ở trạng thái chờ duyệt.');
  const bank = w.bankSnapshot;
  let payout;
  try {
    payout = await payosPayout().payouts.create(
      {
        referenceId: w.id,
        amount: Number(w.amountVnd),
        description: 'StoryWeaver rut tien',
        toBin: bank.bankBin,
        toAccountNumber: open(bank.accountSealed),
        category: ['withdrawal'],
      },
      `withdrawal-${w.id}`,
    );
  } catch (error) {
    console.error('[payout] tao lenh chi ho loi', w.id, error?.message);
    throw new ApiError(StatusCodes.BAD_GATEWAY, `payOS chưa nhận lệnh chi: ${error?.message ?? 'lỗi không rõ'}`);
  }
  await prisma.withdrawalRequest.updateMany({
    where: { id, status: 'requested' },
    data: { status: 'processing', handledBy: admin.id, handledAt: now, bankTransactionRef: payout.id },
  });
  return syncWithdrawal(id, { now });
}

/** Admin tu choi (bat buoc ly do) -> tra tien da giu. */
export async function rejectWithdrawal(admin, id, { reason }, { now = new Date() } = {}) {
  const w = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!w) throw ApiError.notFound('Không tìm thấy yêu cầu rút tiền.');
  if (w.status !== 'requested') throw conflict('Chỉ từ chối được yêu cầu đang chờ duyệt.');
  await prisma.$transaction((tx) => release(tx, w, 'rejected', { by: admin.id, reason: reason.trim(), now }), TX);
  return { withdrawal: formatWithdrawal(await prisma.withdrawalRequest.findUnique({ where: { id } })) };
}

/**
 * Hoi payOS trang thai lenh chi ho cua yeu cau `processing`: moi giao dich SUCCEEDED -> paid (tru tien da giu);
 * that bai -> rejected + tra tien. Goi tu Admin (xem chi tiet) va cron worker.
 */
export async function syncWithdrawal(id, { now = new Date() } = {}) {
  const w = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (w?.status === 'processing' && w.bankTransactionRef) {
    let payout = null;
    try {
      payout = await payosPayout().payouts.get(w.bankTransactionRef);
    } catch (error) {
      console.error('[payout] khong lay duoc trang thai', id, error?.message);
    }
    // Kieu trong SDK @payos/node 2.0.5 (khac trang docs): giao dich SUCCEEDED | FAILED | CANCELLED |
    // REVERSED | ...; lenh COMPLETED | FAILED | REJECTED | CANCELLED | PROCESSING | ...
    const states = (payout?.transactions ?? []).map((t) => t.state);
    const failed =
      states.some((s) => ['FAILED', 'CANCELLED', 'REVERSED'].includes(s)) ||
      ['FAILED', 'REJECTED', 'CANCELLED'].includes(payout?.approvalState);
    const succeeded = states.length > 0 && states.every((s) => s === 'SUCCEEDED');
    if (succeeded && !failed) {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.withdrawalRequest.updateMany({ where: { id, status: 'processing' }, data: { status: 'paid' } });
        if (count !== 1) return;
        await moveEarning(tx, {
          userId: w.sellerId, entryType: 'withdrawal_paid', amount: -w.amountVnd,
          delta: { earningLockedVnd: -w.amountVnd }, key: `withdraw_paid:${w.id}`, refType: 'withdrawal', refId: w.id,
        });
      }, TX);
    } else if (failed) {
      await prisma.$transaction((tx) => release(tx, w, 'rejected', { reason: 'Chi hộ payOS thất bại — tiền đã được trả lại.', now }), TX);
    }
  }
  return { withdrawal: formatWithdrawal(await prisma.withdrawalRequest.findUnique({ where: { id } })) };
}

/** Cron: dong bo moi yeu cau dang chi ho. */
export async function syncProcessingWithdrawals() {
  const rows = await prisma.withdrawalRequest.findMany({ where: { status: 'processing' }, select: { id: true }, take: 100 });
  for (const r of rows) await syncWithdrawal(r.id);
  return rows.length;
}

export default { updateBank, getEarnings, requestWithdrawal, cancelWithdrawal, listWithdrawals, approveWithdrawal, rejectWithdrawal, syncWithdrawal };
