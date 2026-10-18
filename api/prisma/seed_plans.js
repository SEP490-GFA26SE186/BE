// =============================================================================
// Seed: goi dich vu (rev8 plans). Nguoi dung duyet 2026-10-18. 1 truyen AI = 1 credit (ai_cost.story_text).
// upsert theo code voi update: {} — chay lai KHONG ghi de gia Admin da chinh.
// =============================================================================

export const plansData = [
  { code: 'FREE', name: 'Gói Miễn phí', durationMonths: 1, priceVnd: 0n, creditsPerMonth: 3, maxChildren: 1, maxCharacters: 5, canSell: false },
  { code: 'FAMILY_MONTH', name: 'Gói Gia đình (tháng)', durationMonths: 1, priceVnd: 49000n, creditsPerMonth: 20, maxChildren: 3, maxCharacters: 20, canSell: true },
  { code: 'FAMILY_YEAR', name: 'Gói Gia đình (năm)', durationMonths: 12, priceVnd: 490000n, creditsPerMonth: 20, maxChildren: 3, maxCharacters: 20, canSell: true },
];

export async function seedPlans(prisma) {
  console.log('🌱 Seeding plans...');
  for (const plan of plansData) {
    await prisma.plan.upsert({ where: { code: plan.code }, update: {}, create: { ...plan, isActive: true } });
  }
  console.log(`✅ plans done (${plansData.length} gói).`);
}
