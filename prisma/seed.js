import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const eqSkillsData = [
  {
    caselCode: 'self_awareness',
    nameVi: 'Tự nhận thức',
    nameEn: 'Self-Awareness',
    description:
      'Khả năng hiểu rõ cảm xúc, suy nghĩ và giá trị của bản thân, nhận biết điểm mạnh và hạn chế của mình với sự tự tin và tinh thần cầu tiến.',
    displayOrder: 1,
  },
  {
    caselCode: 'self_management',
    nameVi: 'Tự quản lý',
    nameEn: 'Self-Management',
    description:
      'Khả năng điều tiết cảm xúc, suy nghĩ và hành vi một cách hiệu quả trong các tình huống khác nhau, kiểm soát xung động và vượt qua thử thách để đạt được mục tiêu.',
    displayOrder: 2,
  },
  {
    caselCode: 'social_awareness',
    nameVi: 'Nhận thức xã hội',
    nameEn: 'Social Awareness',
    description:
      'Khả năng đồng cảm và thấu hiểu góc nhìn của người khác, bao gồm cả những người có hoàn cảnh và văn hóa đa dạng, thể hiện lòng trắc ẩn và sự quan tâm.',
    displayOrder: 3,
  },
  {
    caselCode: 'relationship_skills',
    nameVi: 'Kỹ năng quan hệ',
    nameEn: 'Relationship Skills',
    description:
      'Khả năng thiết lập và duy trì các mối quan hệ lành mạnh, hỗ trợ lẫn nhau, giao tiếp rõ ràng, lắng nghe tích cực, hợp tác và giải quyết xung đột mang tính xây dựng.',
    displayOrder: 4,
  },
  {
    caselCode: 'responsible_decision_making',
    nameVi: 'Ra quyết định có trách nhiệm',
    nameEn: 'Responsible Decision-Making',
    description:
      'Khả năng đưa ra những lựa chọn xây dựng và chu đáo về hành vi cá nhân và các tương tác xã hội dựa trên chuẩn mực đạo đức, an toàn và lợi ích chung.',
    displayOrder: 5,
  },
];

async function main() {
  console.log('🌱 Starting seed: CASEL EQ Skills...');

  for (const skill of eqSkillsData) {
    const upserted = await prisma.eqSkill.upsert({
      where: { caselCode: skill.caselCode },
      update: {
        nameVi: skill.nameVi,
        nameEn: skill.nameEn,
        description: skill.description,
        displayOrder: skill.displayOrder,
      },
      create: skill,
    });
    console.log(`  ✓ Seeded skill: [${upserted.caselCode}] ${upserted.nameVi} (${upserted.nameEn})`);
  }

  console.log('✅ CASEL EQ Skills seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error while seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
