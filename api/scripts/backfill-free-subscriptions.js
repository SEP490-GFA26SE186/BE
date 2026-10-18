/**
 * Bo sung goi Mien phi + credit thang dau cho phu huynh dang ky TRUOC khi register tu tao goi.
 * Chay mot lan. Mac dinh chi in ra (dry run), them --apply moi ghi DB.
 *
 *   node scripts/backfill-free-subscriptions.js           # xem ai se duoc bo sung
 *   node scripts/backfill-free-subscriptions.js --apply   # ghi that
 *
 * Trong Docker:
 *   docker compose exec api node scripts/backfill-free-subscriptions.js --apply
 *
 * Chay lai nhieu lan van an toan: chi xu ly phu huynh CHUA CO subscription nao (ke ca da het han),
 * nen nguoi tung co goi tra phi roi het han se khong bi cap them.
 */
import prisma from '../src/config/prisma.js';
import plansService from '../src/modules/plans/plans.service.js';

const apply = process.argv.includes('--apply');

const freePlan = await plansService.getFreePlan();
if (!freePlan) {
  console.error('Khong co goi Mien phi dang hoat dong (code FREE hoac gia 0d). Dung lai.');
  process.exit(1);
}

const parents = await prisma.user.findMany({
  where: {
    role: 'parent',
    deletedAt: null,
    subscriptions: { none: {} },
  },
  select: { id: true, username: true, email: true },
  orderBy: { createdAt: 'asc' },
});

console.log(`Goi: ${freePlan.code} (${freePlan.creditsPerMonth} credit/thang)`);
console.log(`Phu huynh chua co subscription: ${parents.length}`);

let done = 0;
let failed = 0;
for (const parent of parents) {
  if (!apply) {
    console.log(`  [dry-run] ${parent.username} <${parent.email}>`);
    continue;
  }
  try {
    await prisma.$transaction((tx) =>
      plansService.activateSubscription(tx, { userId: parent.id, plan: freePlan }),
    );
    done += 1;
    console.log(`  ok   ${parent.username}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${parent.username}: ${err.message}`);
  }
}

if (apply) {
  console.log(`Xong: ${done} thanh cong, ${failed} loi`);
} else {
  console.log('Dry run, chua ghi gi. Them --apply de ghi that.');
}

await prisma.$disconnect();
process.exit(failed > 0 ? 1 : 0);
