// =============================================================================
// Entry point cho `prisma db seed` / `npm run db:seed` — rev 8
//
// Prisma KHONG chay lenh seed qua shell, nen "node a.js && node b.js" trong
// prisma.config.ts se bi bo qua phan sau dau &&. Vi vay moi seed la mot module
// export ham, va file nay dieu phoi theo dung thu tu phu thuoc.
// =============================================================================

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedEqSkills } from './seed_eq_skills.js';
import { seedPedagogy } from './seed_pedagogy.js';
import { seedTopics } from './seed_topics.js';
import { seedPlatformSettings } from './seed_platform_settings.js';
import { seedPlans } from './seed_plans.js';
import { seedMarket } from './seed_market.js';

const prisma = new PrismaClient();

async function main() {
  // Thu tu quan trong: topics.skill_id tro vao eq_skills; topic_sub_skills tro vao eq_sub_skills.
  await seedEqSkills(prisma);
  // Mac dinh ban hanh san de test/demo chay duoc; seed "that" dat SEED_PUBLISH_PEDAGOGY=false
  // de mau o trang thai nhap cho Specialist doc va ban hanh (spec su pham §5.2).
  await seedPedagogy(prisma, { publish: process.env.SEED_PUBLISH_PEDAGOGY !== 'false' });
  await seedTopics(prisma);
  // updated_by tro vao specialist do seedTopics tao.
  await seedPlatformSettings(prisma);
  await seedPlans(prisma);
  await seedMarket(prisma);
}

main()
  .catch((e) => {
    console.error('❌ Error while seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
