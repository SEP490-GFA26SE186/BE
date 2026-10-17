// Bai hoc (topics) do Moderator soan, gan mot nang luc CASEL (rev8 thay khuon truyen / template).
// Phu huynh chon mot bai hoc khi tao truyen. Them / sua / xoa cua Moderator: lam o phan vai tro Moderator.
import { prisma } from '../../config/index.js';

/** Bai hoc dang hoat dong, theo display_order. `guidance` la huong dan cho AI, khong tra cho phu huynh. */
const getActiveTopics = () =>
  prisma.topic.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    select: {
      id: true,
      title: true,
      ageMin: true,
      ageMax: true,
      skill: { select: { id: true, caselCode: true, nameVi: true } },
    },
  });

export default { getActiveTopics };
