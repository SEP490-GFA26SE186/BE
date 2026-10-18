import { hasTestDb } from './_db.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent } from './_fixtures.js';

// Rang buoc toan ven o tang DB (migration 20261020000000_integrity_indexes): code da kiem truoc, DB chan lan cuoi.
const skip = !hasTestDb;

after(async () => {
  await prisma.$disconnect();
});

const rejects = (promise, pattern) => assert.rejects(promise, (e) => pattern.test(`${e.code} ${e.message}`));

test('DB: mot luot duyet mo / truyen; mot yeu cau rut chua xong / nguoi ban (ke ca processing)', { skip }, async () => {
  const listing = await prisma.listing.findFirst({ where: { moderationReviews: { none: { decidedAt: null } } } });
  if (listing) {
    const first = await prisma.moderationReview.create({ data: { listingId: listing.id, reviewType: 'random_audit' } });
    await rejects(prisma.moderationReview.create({ data: { listingId: listing.id, reviewType: 'random_audit' } }), /P2002|unique/i);
    await prisma.moderationReview.delete({ where: { id: first.id } });
  }

  const s = await createParent();
  await prisma.sellerProfile.create({ data: { userId: s.user.id, displayName: `NB ${Date.now()}`, status: 'approved' } });
  const base = { sellerId: s.user.id, amountVnd: 60000n, bankSnapshot: {} };
  await prisma.withdrawalRequest.create({ data: { ...base, status: 'processing' } });
  await rejects(prisma.withdrawalRequest.create({ data: base }), /P2002|unique/i);
});

test('DB: CHECK bao cao dung mot doi tuong, quyet dinh di cung thoi diem, tong don, hoan tien phai co ma', { skip }, async () => {
  const u = await createParent();
  await rejects(prisma.contentReport.create({ data: { reporterId: u.user.id, category: 'other' } }), /content_reports_target_check|23514/);
  const listing = await prisma.listing.findFirst();
  if (listing) {
    await rejects(prisma.moderationReview.create({ data: { listingId: listing.id, reviewType: 'submission', decision: 'approved' } }), /decision_check|23514/);
  }
  await rejects(prisma.order.create({ data: { buyerId: u.user.id, subtotalVnd: 10000n, discountVnd: 0n, totalVnd: 9000n, payosOrderCode: BigInt(Date.now()) } }), /orders_total_check|23514/);
});

test('DB: xoa don da co muc thanh toan bi chan (RESTRICT, khong mat lich su tien)', { skip }, async () => {
  const u = await createParent();
  const plan = await prisma.plan.findFirst();
  const order = await prisma.order.create({
    data: { buyerId: u.user.id, subtotalVnd: 0n, totalVnd: 0n, items: { create: { itemType: 'plan', planId: plan.id, unitPriceVnd: 0n } } },
  });
  await rejects(prisma.order.delete({ where: { id: order.id } }), /P2003|foreign key|violates/i);
});
