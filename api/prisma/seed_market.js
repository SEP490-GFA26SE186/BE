// =============================================================================
// Seed: bac gia dang ban (price_tiers) + checklist Specialist duyet truyen (checklist_items).
// Checklist = 7 nguyen tac noi dung (BE/ai/docs/07-content-principles.md). upsert, update: {} —
// chay lai KHONG ghi de noi dung Admin / Specialist da chinh.
// =============================================================================

export const priceTiersData = [
  { label: 'Miễn phí', priceVnd: 0n },
  { label: '19.000đ', priceVnd: 19000n },
  { label: '29.000đ', priceVnd: 29000n },
  { label: '49.000đ', priceVnd: 49000n },
];

export const checklistData = [
  { code: 'no_answer_label', description: 'Lời kể không dán nhãn đáp án đúng ("đã chọn cách đúng đắn").' },
  { code: 'natural_consequence', description: 'Hệ quả tự nhiên, không trừng phạt (không "bị phạt đứng góc").' },
  { code: 'repair_path', description: 'Luôn có đường sửa sai; truyện không kết bằng việc hỏng không sửa được.' },
  { code: 'named_emotions', description: 'Cảm xúc được gọi tên rõ ràng (trừ trang ngay trước câu hỏi cảm xúc).' },
  { code: 'no_preaching', description: 'Tuyệt đối không giảng đạo lý ("Bài học hôm nay là…", "Con phải nhớ rằng…").' },
  { code: 'no_comparison', description: 'Không so sánh, không thi đua giữa các bé ("ngoan hơn").' },
  { code: 'age_appropriate', description: 'Hệ quả vừa tầm tuổi 5–8 (không chết chóc, mất mát vĩnh viễn, bố mẹ thất vọng làm hình phạt).' },
];

export async function seedMarket(prisma) {
  console.log('🌱 Seeding price_tiers + checklist_items...');
  for (const tier of priceTiersData) {
    await prisma.priceTier.upsert({ where: { priceVnd: tier.priceVnd }, update: {}, create: { ...tier, isActive: true } });
  }
  for (const [i, item] of checklistData.entries()) {
    await prisma.checklistItem.upsert({
      where: { code: item.code },
      update: {},
      create: { ...item, displayOrder: i + 1, isActive: true },
    });
  }
  console.log(`✅ price_tiers (${priceTiersData.length}) + checklist_items (${checklistData.length}) done.`);
}
