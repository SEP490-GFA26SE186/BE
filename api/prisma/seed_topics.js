// =============================================================================
// Seed: topics (danh sach bai hoc do Specialist quan ly) — rev 8
//
// Thay cho seed_templates.js cua rev 6. rev 8 bo he thong templates/stages/slots:
// AI viet ca truyen mot lan tu topic + situation, khung trang do story_layout
// trong platform_settings quy dinh, khong con bang template nao.
//
// Phai chay sau seedEqSkills (topics.skill_id) va seedPedagogy (topic_sub_skills tro vao eq_sub_skills).
// subSkillCodes: 1-3 ky nang con cung nang luc (code trong prisma/data/pedagogy.js).
// =============================================================================

import bcrypt from 'bcryptjs';

const SPECIALIST_EMAIL = 'pedagogy@storyweaver.ai';

// guidance: vai cau huong dan noi dung, gui kem cho AI khi viet truyen
export const topicsData = [
  {
    title: 'Tập chia sẻ đồ chơi cùng bạn',
    caselCode: 'relationship_skills',
    guidance:
      'Giúp bé nhận diện niềm vui khi chơi chung, thấu hiểu cảm xúc của bạn bè và biết cách thỏa hiệp luân phiên đồ chơi. Tránh mô tả bé bị bắt buộc phải nhường; để bé tự thấy chơi chung vui hơn.',
    ageMin: 4,
    ageMax: 7,
    displayOrder: 1,
    subSkillCodes: ['rs_playing_together', 'rs_making_up', 'rs_saying_what_i_need'],
  },
  {
    title: 'Bé dũng cảm vượt qua nỗi sợ bóng tối',
    caselCode: 'self_management',
    guidance:
      'Thừa nhận nỗi sợ là có thật và bình thường, rồi dẫn bé tới một cách tự xoa dịu cụ thể (hít thở, đèn ngủ, đồ chơi quen thuộc). Không dùng hình ảnh đáng sợ để minh họa nỗi sợ.',
    ageMin: 4,
    ageMax: 8,
    displayOrder: 2,
    subSkillCodes: ['sm_soothing_worries', 'sm_calming_down', 'sm_brave_first_step'],
  },
  {
    title: 'Dũng cảm nhận lỗi khi làm vỡ bình hoa',
    caselCode: 'responsible_decision_making',
    guidance:
      'Nhấn vào lựa chọn nói thật và cảm giác nhẹ nhõm sau đó, không nhấn vào hình phạt. Người lớn trong truyện phản ứng bình tĩnh để bé thấy nhận lỗi là an toàn.',
    ageMin: 5,
    ageMax: 8,
    displayOrder: 3,
    subSkillCodes: ['rdm_what_happens_next', 'rdm_finding_solutions', 'rdm_helping_out'],
  },
  {
    title: 'Con hay nổi giận',
    caselCode: 'self_awareness',
    guidance:
      'Giúp bé gọi tên cơn giận và nhận ra dấu hiệu trong cơ thể (nóng mặt, tim đập nhanh, muốn quăng đồ) trước khi hành động. Mục tiêu là nhận biết, chưa phải kiểm soát.',
    ageMin: 5,
    ageMax: 8,
    displayOrder: 4,
    subSkillCodes: ['sa_emotion_naming', 'sa_feeling_causes'],
  },
  {
    title: 'Bạn mới trong lớp không có ai chơi cùng',
    caselCode: 'social_awareness',
    guidance:
      'Dẫn bé đặt mình vào vị trí bạn mới: bạn ấy đang cảm thấy gì, muốn gì. Kết thúc bằng một hành động nhỏ và làm được ngay, ví dụ mời bạn cùng chơi.',
    ageMin: 5,
    ageMax: 8,
    displayOrder: 5,
    subSkillCodes: ['soa_why_others_feel', 'soa_feeling_with_others', 'soa_kind_words'],
  },
];

// Specialist tao du lieu su pham (topics.created_by, eq_sub_skills.created_by...). Tao neu chua co.
export async function ensureSpecialist(prisma) {
  let specialist = await prisma.user.findUnique({ where: { email: SPECIALIST_EMAIL } });
  if (!specialist) {
    const passwordHash = await bcrypt.hash('PedagogySecret2026!', 10);
    specialist = await prisma.user.create({
      data: {
        email: SPECIALIST_EMAIL,
        username: 'storyweaver_pedagogy',
        fullName: 'Ban Sư Phạm StoryWeaver AI',
        passwordHash,
        role: 'specialist',
        isActive: true,
      },
    });
    console.log('  ✓ Created pedagogy specialist:', specialist.id);
  }
  return specialist;
}

// Gan ky nang con cho topic CHI KHI topic chua co lien ket nao: Specialist da doi danh sach thi giu nguyen.
// Chi gan ky nang con cung nang luc voi topic hien tai (Specialist co the da doi nang luc topic, xoa ky nang con).
async function linkSubSkills(prisma, topicRow, topic) {
  const linked = await prisma.topicSubSkill.count({ where: { topicId: topicRow.id } });
  if (linked > 0) return 0;
  const subs = await prisma.eqSubSkill.findMany({ where: { code: { in: topic.subSkillCodes } } });
  const ok = subs.filter((s) => s.skillId === topicRow.skillId);
  if (ok.length < topic.subSkillCodes.length) {
    const missing = topic.subSkillCodes.filter((c) => !ok.some((s) => s.code === c));
    console.warn(`  ! "${topic.title}": khong gan ${missing.join(', ')} (chua co hoac khac nang luc).`);
  }
  if (ok.length === 0) return 0;
  await prisma.topicSubSkill.createMany({
    data: ok.map((s) => ({ topicId: topicRow.id, subSkillId: s.id })),
    skipDuplicates: true,
  });
  return ok.length;
}

export async function seedTopics(prisma) {
  console.log('🌱 Seeding Topics...');

  // 1. Specialist tao cac bai hoc nay (topics.created_by)
  const specialist = await ensureSpecialist(prisma);

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
      const n = await linkSubSkills(prisma, existing, topic);
      console.log(`  - "${topic.title}" da co (${existing.id}), bo qua${n ? `; gan ${n} ky nang con` : ''}.`);
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
        createdBy: specialist.id,
      },
    });
    const n = await linkSubSkills(prisma, created, topic);
    console.log(`  ✓ "${created.title}" [${topic.caselCode}] + ${n} ky nang con`);
  }

  console.log('✅ Topics done.');
}
