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

/** Ban duoc mot truyen: doanh thu vao ngan cho (giu `holdDays` ngay). */
export const recordEarning = (tx, { sellerId, amount, orderItemId, availableAt }) =>
  moveEarning(tx, {
    userId: sellerId, entryType: 'earning_pending', amount, delta: { earningPendingVnd: BigInt(amount) },
    key: earningKey(orderItemId), refType: 'order_item', refId: orderItemId, availableAt,
  });

/**
 * Cron: doanh thu het han giu -> ngan rut duoc. Moi dong earning_pending toi han ma chua co dong
 * earning_release tuong ung. Tra so dong da mo khoa.
 */
export async function releaseDueEarnings(prisma, now = new Date()) {
  const due = await prisma.walletLedger.findMany({
    where: { walletType: 'earning', entryType: 'earning_pending', availableAt: { lte: now } },
    select: { userId: true, amount: true, refId: true },
    take: 1000,
  });
  let released = 0;
  for (const row of due) {
    const ok = await prisma.$transaction(
      (tx) =>
        moveEarning(tx, {
          userId: row.userId, entryType: 'earning_release', amount: row.amount,
          delta: { earningPendingVnd: -row.amount, earningAvailableVnd: row.amount },
          key: releaseKey(row.refId), refType: 'order_item', refId: row.refId,
        }),
      { timeout: 20000 },
    );
    if (ok) released += 1;
  }
  return released;
}
