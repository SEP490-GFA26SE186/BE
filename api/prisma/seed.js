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
import { seedTopics } from './seed_topics.js';

const prisma = new PrismaClient();

async function main() {
  // Thu tu quan trong: topics.skill_id tro vao eq_skills.
  await seedEqSkills(prisma);
  await seedTopics(prisma);
}

main()
  .catch((e) => {
    console.error('❌ Error while seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
