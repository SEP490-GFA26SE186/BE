import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting Seed: Story Templates & Pedagogical Scaffolding...');

  // 1. Get or create system pedagogy author
  const authorEmail = 'pedagogy@storyweaver.ai';
  let author = await prisma.user.findUnique({ where: { email: authorEmail } });
  if (!author) {
    const passwordHash = await bcrypt.hash('PedagogySecret2026!', 10);
    author = await prisma.user.create({
      data: {
        email: authorEmail,
        username: 'storyweaver_pedagogy',
        fullName: 'Ban Sư Phạm StoryWeaver AI',
        passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
    console.log('✓ Created pedagogy author user:', author.id);
  }

  // 2. Fetch EQ skills
  const skills = await prisma.eqSkill.findMany();
  const skillMap = {};
  for (const s of skills) {
    skillMap[s.caselCode] = s.id;
  }

  // 3. Define 3 templates
  const templatesToSeed = [
    {
      title: 'Tập chia sẻ đồ chơi cùng bạn',
      description: 'Giúp bé nhận diện niềm vui khi chơi chung, thấu hiểu cảm xúc của bạn bè và biết cách thỏa hiệp luân phiên đồ chơi.',
      caselCode: 'relationship_skills',
      ageMin: 4,
      ageMax: 7,
      status: 'active',
      slots: [
        { slotKey: '{CON}', characterRole: 'self', defaultName: 'Bé' },
        { slotKey: '{BAN}', characterRole: 'sibling', defaultName: 'Bạn Thỏ' },
      ],
      stages: [
        {
          stageOrder: 1,
          learningObjective: 'Nhận diện niềm vui khi có món đồ chơi mới nhưng bắt đầu nảy sinh tâm lý muốn giữ riêng cho mình.',
          emotionToName: 'hào hứng / phấn khích',
          leadInPages: 2,
          isClimax: false,
        },
        {
          stageOrder: 2,
          learningObjective: 'Đối mặt với tình huống tranh giành và học cách thỏa hiệp cảm xúc mang tính xây dựng.',
          emotionToName: 'bực bội / muốn tranh giành',
          leadInPages: 1,
          isClimax: true,
          choices: [
            {
              choiceOrder: 1,
              typeCode: 'CHIA_SE_DOI_LUOT',
              description: 'Nhường bạn chơi trước 5 phút rồi đổi lượt cho nhau',
              isProsocial: true,
              signals: [
                { caselCode: 'relationship_skills', delta: 2 },
                { caselCode: 'self_management', delta: 1 },
              ],
            },
            {
              choiceOrder: 2,
              typeCode: 'HOP_TAC_CHOI_CHUNG',
              description: 'Cùng chơi chung bằng cách xây đường ray xe lửa cho cả hai bạn',
              isProsocial: true,
              signals: [
                { caselCode: 'relationship_skills', delta: 3 },
                { caselCode: 'social_awareness', delta: 2 },
              ],
            },
            {
              choiceOrder: 3,
              typeCode: 'TRANH_GIANH_ICH_KY',
              description: 'Giằng lấy đồ chơi và quay lưng đi chỗ khác',
              isProsocial: false,
              signals: [
                { caselCode: 'relationship_skills', delta: -2 },
                { caselCode: 'self_management', delta: -1 },
              ],
            },
          ],
        },
        {
          stageOrder: 3,
          learningObjective: 'Củng cố giá trị của việc chia sẻ giúp tình bạn thêm gắn kết và niềm vui được nhân đôi.',
          emotionToName: 'hạnh phúc / ấm áp',
          leadInPages: 2,
          isClimax: false,
        },
      ],
    },
    {
      title: 'Bé dũng cảm vượt qua nỗi sợ bóng tối',
      description: 'Dạy bé kỹ thuật điều hòa cảm xúc, tự trấn an khi ở một mình trong phòng ngủ và nhận thức rằng bóng tối không đáng sợ.',
      caselCode: 'self_management',
      ageMin: 3,
      ageMax: 6,
      status: 'active',
      slots: [
        { slotKey: '{CON}', characterRole: 'self', defaultName: 'Bé' },
        { slotKey: '{ME}', characterRole: 'parent', defaultName: 'Mẹ' },
        { slotKey: '{GAU_BONG}', characterRole: 'toy', defaultName: 'Gấu Bông' },
      ],
      stages: [
        {
          stageOrder: 1,
          learningObjective: 'Nhận diện cảm giác lo âu tự nhiên khi đèn phòng ngủ vừa tắt.',
          emotionToName: 'hồi hộp / lo lắng',
          leadInPages: 2,
          isClimax: false,
        },
        {
          stageOrder: 2,
          learningObjective: 'Học kỹ thuật tự điều hòa nhịp thở và dũng cảm bày tỏ nỗi sợ với người thân.',
          emotionToName: 'sợ hãi',
          leadInPages: 1,
          isClimax: true,
          choices: [
            {
              choiceOrder: 1,
              typeCode: 'TU_TRAN_AN_HIT_THO',
              description: 'Bật đèn ngủ nhỏ, ôm chặt bạn gấu bông và hít thở sâu 3 lần',
              isProsocial: true,
              signals: [
                { caselCode: 'self_management', delta: 3 },
                { caselCode: 'self_awareness', delta: 2 },
              ],
            },
            {
              choiceOrder: 2,
              typeCode: 'BAY_TO_CAM_XUC_VOI_ME',
              description: 'Nói với mẹ: "Mẹ ơi, con thấy sợ cái bóng trên tường"',
              isProsocial: true,
              signals: [
                { caselCode: 'self_management', delta: 2 },
                { caselCode: 'relationship_skills', delta: 1 },
              ],
            },
            {
              choiceOrder: 3,
              typeCode: 'TRUM_CHAN_HOANG_SO',
              description: 'Trùm chăn kín mít và khóc to trong sợ hãi',
              isProsocial: false,
              signals: [{ caselCode: 'self_management', delta: -1 }],
            },
          ],
        },
        {
          stageOrder: 3,
          learningObjective: 'Trải nghiệm sự tự hào khi bản thân đã làm chủ được nỗi sợ và chìm vào giấc ngủ êm đềm.',
          emotionToName: 'bình yên / tự hào',
          leadInPages: 2,
          isClimax: false,
        },
      ],
    },
    {
      title: 'Dũng cảm nhận lỗi khi làm vỡ bình hoa',
      description: 'Giúp bé hiểu rằng ai cũng có thể mắc sai lầm, nhưng việc dũng cảm nhận lỗi và chịu trách nhiệm mới là phẩm chất đáng quý.',
      caselCode: 'responsible_decision_making',
      ageMin: 5,
      ageMax: 8,
      status: 'active',
      slots: [
        { slotKey: '{CON}', characterRole: 'self', defaultName: 'Bé' },
        { slotKey: '{BO}', characterRole: 'parent', defaultName: 'Bố' },
        { slotKey: '{CUN}', characterRole: 'pet', defaultName: 'Cún Cưng' },
      ],
      stages: [
        {
          stageOrder: 1,
          learningObjective: 'Hiểu rằng chơi đùa mải mê trong nhà có thể dẫn đến hậu quả bất cẩn.',
          emotionToName: 'vui vẻ / hăng say',
          leadInPages: 2,
          isClimax: false,
        },
        {
          stageOrder: 2,
          learningObjective: 'Đứng trước ngã rẽ đạo đức giữa việc nhận lỗi hay đổ tội cho người khác.',
          emotionToName: 'hoang mang / sợ bị mắng',
          leadInPages: 1,
          isClimax: true,
          choices: [
            {
              choiceOrder: 1,
              typeCode: 'THANH_THAT_NHAN_LOI',
              description: 'Đứng lại và nói thành thật: "Con vô ý làm vỡ, con xin lỗi bố ạ!"',
              isProsocial: true,
              signals: [
                { caselCode: 'responsible_decision_making', delta: 3 },
                { caselCode: 'self_awareness', delta: 2 },
              ],
            },
            {
              choiceOrder: 2,
              typeCode: 'DO_LOI_CHO_THU_CUNG',
              description: 'Nói dối rằng chú Cún chạy nhanh đã làm quệt đuôi vào bình hoa',
              isProsocial: false,
              signals: [
                { caselCode: 'responsible_decision_making', delta: -3 },
                { caselCode: 'social_awareness', delta: -2 },
              ],
            },
            {
              choiceOrder: 3,
              typeCode: 'TRON_TRANH_TRACH_NHIEM',
              description: 'Lẳng lặng bỏ chạy vào phòng và coi như mình không biết gì',
              isProsocial: false,
              signals: [
                { caselCode: 'responsible_decision_making', delta: -2 },
                { caselCode: 'self_management', delta: -1 },
              ],
            },
          ],
        },
        {
          stageOrder: 3,
          learningObjective: 'Học cách cùng người lớn khắc phục hậu quả và cảm nhận được sự ấm áp của sự tha thứ.',
          emotionToName: 'nhẹ nhõm / biết ơn',
          leadInPages: 2,
          isClimax: false,
        },
      ],
    },
  ];

  // 4. Seed each template
  for (const item of templatesToSeed) {
    const primarySkillId = skillMap[item.caselCode];
    if (!primarySkillId) {
      console.warn(`Skill ${item.caselCode} not found in DB!`);
      continue;
    }

    // Check if template already seeded
    const existing = await prisma.template.findFirst({
      where: { title: item.title },
    });

    if (existing) {
      console.log(`- Template "${item.title}" already exists (ID: ${existing.id}), skipping.`);
      continue;
    }

    // Create template with slots and stages
    await prisma.$transaction(async (tx) => {
      const template = await tx.template.create({
        data: {
          title: item.title,
          description: item.description,
          primarySkillId,
          ageMin: item.ageMin,
          ageMax: item.ageMax,
          status: item.status,
          createdById: author.id,
        },
      });

      // Slots
      for (const slot of item.slots) {
        await tx.templateSlot.create({
          data: {
            templateId: template.id,
            slotKey: slot.slotKey,
            characterRole: slot.characterRole,
            defaultName: slot.defaultName,
          },
        });
      }

      // Stages
      for (const stage of item.stages) {
        const createdStage = await tx.templateStage.create({
          data: {
            templateId: template.id,
            stageOrder: stage.stageOrder,
            learningObjective: stage.learningObjective,
            emotionToName: stage.emotionToName,
            leadInPages: stage.leadInPages,
            isClimax: stage.isClimax,
          },
        });

        if (stage.choices && stage.choices.length > 0) {
          for (const choice of stage.choices) {
            const createdChoice = await tx.templateChoiceType.create({
              data: {
                stageId: createdStage.id,
                choiceOrder: choice.choiceOrder,
                typeCode: choice.typeCode,
                description: choice.description,
                isProsocial: choice.isProsocial,
              },
            });

            if (choice.signals && choice.signals.length > 0) {
              for (const sig of choice.signals) {
                const targetSkillId = skillMap[sig.caselCode];
                if (targetSkillId) {
                  await tx.templateChoiceSignal.create({
                    data: {
                      choiceTypeId: createdChoice.id,
                      skillId: targetSkillId,
                      delta: sig.delta,
                    },
                  });
                }
              }
            }
          }
        }
      }

      console.log(`✓ Seeded Template: "${template.title}" (ID: ${template.id}) with ${item.slots.length} slots & ${item.stages.length} stages.`);
    });
  }

  console.log('🎉 Seed templates completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding templates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
