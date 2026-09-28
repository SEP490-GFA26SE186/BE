// =============================================================================
// Seed: topics (danh sach bai hoc do Moderator quan ly) — rev 8
//
// Thay cho seed_templates.js cua rev 6. rev 8 bo he thong templates/stages/slots:
// AI viet ca truyen mot lan tu topic + situation, khung trang do story_layout
// trong platform_settings quy dinh, khong con bang template nao.
//
// Phai chay sau seedEqSkills: topics.skill_id tro vao eq_skills.
// =============================================================================

import bcrypt from 'bcryptjs';

const MODERATOR_EMAIL = 'pedagogy@storyweaver.ai';

// guidance: vai cau huong dan noi dung, gui kem cho AI khi viet truyen
const topicsData = [
  {
    title: 'Tập chia sẻ đồ chơi cùng bạn',
    caselCode: 'relationship_skills',
    guidance:
      'Giúp bé nhận diện niềm vui khi chơi chung, thấu hiểu cảm xúc của bạn bè và biết cách thỏa hiệp luân phiên đồ chơi. Tránh mô tả bé bị bắt buộc phải nhường; để bé tự thấy chơi chung vui hơn.',
    ageMin: 4,
    ageMax: 7,
    displayOrder: 1,
  },
  {
    title: 'Bé dũng cảm vượt qua nỗi sợ bóng tối',
    caselCode: 'self_management',
    guidance:
      'Thừa nhận nỗi sợ là có thật và bình thường, rồi dẫn bé tới một cách tự xoa dịu cụ thể (hít thở, đèn ngủ, đồ chơi quen thuộc). Không dùng hình ảnh đáng sợ để minh họa nỗi sợ.',
    ageMin: 4,
    ageMax: 8,
    displayOrder: 2,
  },
  {
    title: 'Dũng cảm nhận lỗi khi làm vỡ bình hoa',
    caselCode: 'responsible_decision_making',
    guidance:
      'Nhấn vào lựa chọn nói thật và cảm giác nhẹ nhõm sau đó, không nhấn vào hình phạt. Người lớn trong truyện phản ứng bình tĩnh để bé thấy nhận lỗi là an toàn.',
    ageMin: 5,
    ageMax: 8,
    displayOrder: 3,
  },
  {
    title: 'Con hay nổi giận',
    caselCode: 'self_awareness',
    guidance:
      'Giúp bé gọi tên cơn giận và nhận ra dấu hiệu trong cơ thể (nóng mặt, tim đập nhanh, muốn quăng đồ) trước khi hành động. Mục tiêu là nhận biết, chưa phải kiểm soát.',
    ageMin: 5,
    ageMax: 8,
    displayOrder: 4,
  },
  {
    title: 'Bạn mới trong lớp không có ai chơi cùng',
    caselCode: 'social_awareness',
    guidance:
      'Dẫn bé đặt mình vào vị trí bạn mới: bạn ấy đang cảm thấy gì, muốn gì. Kết thúc bằng một hành động nhỏ và làm được ngay, ví dụ mời bạn cùng chơi.',
    ageMin: 5,
    ageMax: 8,
    displayOrder: 5,
  },
];

export async function seedTopics(prisma) {
  console.log('🌱 Seeding Topics...');

  // 1. Moderator tao cac bai hoc nay (topics.created_by)
  let moderator = await prisma.user.findUnique({ where: { email: MODERATOR_EMAIL } });
  if (!moderator) {
    const passwordHash = await bcrypt.hash('PedagogySecret2026!', 10);
    moderator = await prisma.user.create({
      data: {
        email: MODERATOR_EMAIL,
        username: 'storyweaver_pedagogy',
        fullName: 'Ban Sư Phạm StoryWeaver AI',
        passwordHash,
        role: 'moderator',
        isActive: true,
      },
    });
    console.log('  ✓ Created pedagogy moderator:', moderator.id);
  }

  const skills = await prisma.eqSkill.findMany();
  if (skills.length === 0) {
    throw new Error('eq_skills rong — seedEqSkills phai chay truoc seedTopics.');
  }
  const skillIdByCode = Object.fromEntries(skills.map((s) => [s.caselCode, s.id]));

  // 2. Topics. Khong dung upsert vi rev8 khong dat unique tren title.
  for (const topic of topicsData) {
    const skillId = skillIdByCode[topic.caselCode];
    if (!skillId) {
      console.warn(`  ! Bo qua "${topic.title}": khong tim thay skill ${topic.caselCode}`);
      continue;
    }

    const existing = await prisma.topic.findFirst({ where: { title: topic.title } });
    if (existing) {
      console.log(`  - "${topic.title}" da co (${existing.id}), bo qua.`);
      continue;
    }

    const created = await prisma.topic.create({
      data: {
        title: topic.title,
        skillId,
        guidance: topic.guidance,
        ageMin: topic.ageMin,
        ageMax: topic.ageMax,
        displayOrder: topic.displayOrder,
        createdBy: moderator.id,
      },
    });
    console.log(`  ✓ "${created.title}" [${topic.caselCode}]`);
  }

  console.log('✅ Topics done.');
}
