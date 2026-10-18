// So doanh thu nguoi ban (wallet_type = earning, append-only). `tx` la transaction client Prisma.
// Bat bien: wallets.earning_pending_vnd + earning_available_vnd + earning_locked_vnd = doanh thu chua
// rut; moi lan doi so du deu co mot dong wallet_ledger (balance_after = tong ba ngan sau khi doi).
// Doanh thu khong bao gio doi thanh credit (DBML wallets).

const total = (w) => BigInt(w.earningPendingVnd) + BigInt(w.earningAvailableVnd) + BigInt(w.earningLockedVnd);

async function lockEarningWallet(tx, userId) {
  await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  const [row] = await tx.$queryRaw`
    SELECT earning_pending_vnd, earning_available_vnd, earning_locked_vnd FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;
  return {
    earningPendingVnd: BigInt(row.earning_pending_vnd),
    earningAvailableVnd: BigInt(row.earning_available_vnd),
    earningLockedVnd: BigInt(row.earning_locked_vnd),
  };
}

const recorded = async (tx, key) =>
  Boolean(await tx.walletLedger.findUnique({ where: { idempotencyKey: key }, select: { id: true } }));

/**
 * Doi so du doanh thu theo `delta` ({ earningPendingVnd?, earningAvailableVnd?, earningLockedVnd? } bigint)
 * va ghi mot dong ledger. Key da ghi -> bo qua (tra false). Ngan nao am -> loi (bug phia goi).
 */
export async function moveEarning(tx, { userId, entryType, amount, delta, key, refType, refId = null, availableAt = null }) {
  const w = await lockEarningWallet(tx, userId);
  if (await recorded(tx, key)) return false;
  const next = { ...w };
  for (const [k, v] of Object.entries(delta)) next[k] = w[k] + v;
  if (Object.values(next).some((v) => v < 0n)) throw new Error(`So du doanh thu am (${entryType}, ${key})`);
  await tx.wallet.update({ where: { userId }, data: next });
  await tx.walletLedger.create({
    data: {
      userId, walletType: 'earning', entryType, amount: BigInt(amount), balanceAfter: total(next),
      idempotencyKey: key, refType, refId, availableAt,
    },
  });
  return true;
}

export const earningKey = (orderItemId) => `earning:${orderItemId}`;
export const releaseKey = (orderItemId) => `earning_release:${orderItemId}`;
export const reversalKey = (orderItemId) => `earning_reversal:${orderItemId}`;

/** Ban duoc mot truyen: doanh thu vao ngan cho (giu `holdDays` ngay). */
export const recordEarning = (tx, { sellerId, amount, orderItemId, availableAt }) =>
  moveEarning(tx, {
    userId: sellerId, entryType: 'earning_pending', amount, delta: { earningPendingVnd: BigInt(amount) },
    key: earningKey(orderItemId), refType: 'order_item', refId: orderItemId, availableAt,
  });

/**
 * Cron: doanh thu het han giu -> ngan rut duoc. Moi dong earning_pending toi han ma chua co dong
 * earning_release tuong ung. Bo qua khoan dang co yeu cau hoan tien cho xu ly (giu tiep cho toi khi Admin
 * quyet) va khoan da hoan (earning_reversal). `userId`: chi mot nguoi ban (doi soat / test chay song song
 * voi thoi diem gia lap). Tra so dong da mo khoa.
 */
export async function releaseDueEarnings(prisma, now = new Date(), { batch = 1000, userId = null } = {}) {
  // Chi lay khoan CHUA mo khoa / chua hoan / khong dang cho hoan. Lay ca dong da xu ly (take N don thuan)
  // thi khi so dong cu vuot N, cron doc mai cac dong cu va khong bao gio toi khoan moi.
  const due = await prisma.$queryRaw`
    SELECT p.user_id AS "userId", p.amount, p.ref_id AS "refId"
    FROM wallet_ledger p
    WHERE p.wallet_type = 'earning' AND p.entry_type = 'earning_pending' AND p.available_at <= ${now}
      AND (${userId}::uuid IS NULL OR p.user_id = ${userId}::uuid)
      AND NOT EXISTS (SELECT 1 FROM wallet_ledger r WHERE r.idempotency_key IN ('earning_release:' || p.ref_id, 'earning_reversal:' || p.ref_id))
      AND NOT EXISTS (SELECT 1 FROM refund_requests q WHERE q.order_item_id = p.ref_id AND q.status = 'pending')
    ORDER BY p.available_at
    LIMIT ${batch}`;
  let released = 0;
  for (const row of due) {
    const ok = await prisma.$transaction(async (tx) => {
      if (await recorded(tx, reversalKey(row.refId))) return false;
      if (await tx.refundRequest.findFirst({ where: { orderItemId: row.refId, status: 'pending' }, select: { id: true } })) return false;
      return moveEarning(tx, {
        userId: row.userId, entryType: 'earning_release', amount: row.amount,
        delta: { earningPendingVnd: -row.amount, earningAvailableVnd: row.amount },
        key: releaseKey(row.refId), refType: 'order_item', refId: row.refId,
      });
    }, { timeout: 20000 });
    if (ok) released += 1;
  }
  return released;
}
