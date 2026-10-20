// Soat mau checkpoint cham diem (Specialist): xem mau do AI sinh, danh dau on / loai khoi diem.
// QUYEN RIENG TU: khong tra ten that, khong tra situation; token {NVx} doi thanh "Bạn A/B..." (aliasName neu la ban published).
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TOKEN_RE = /\{NV\d+\}/g;

/** Map token -> ten hien thi: nhan vat chinh = Bạn A, con lai theo thu tu token = Bạn B, C...; ban published dung aliasName. */
function buildNames(story) {
  const chars = [...story.storyCharacters].sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.token.localeCompare(b.token, 'en', { numeric: true }));
  const map = new Map();
  chars.forEach((c, i) => {
    const generic = `Bạn ${LABELS[i] ?? i + 1}`;
    map.set(c.token.startsWith('{') ? c.token : `{${c.token}}`, story.kind === 'published' && c.aliasName ? c.aliasName : generic);
  });
  return map;
}
const mask = (text, names) => {
  if (text == null) return text;
  // Token la khong co trong bang (hiem) -> ten chung tiep theo, khong bao gio de lo token
  return text.replace(TOKEN_RE, (t) => {
    if (!names.has(t)) names.set(t, `Bạn ${LABELS[names.size] ?? names.size + 1}`);
    return names.get(t);
  });
};

const INCLUDE = {
  story: { select: { id: true, kind: true, createdAt: true, storyCharacters: { select: { token: true, aliasName: true, isMain: true } } } },
  afterPage: { select: { contentText: true } },
  options: { orderBy: { optionOrder: 'asc' }, select: { text: true, role: true, isCorrect: true } },
  subSkill: { select: { id: true, nameVi: true, skill: { select: { id: true, caselCode: true, nameVi: true } } } },
  templateVersion: { select: { version: true, template: { select: { id: true, title: true } } } },
};

const statusOf = (c) => (c.excluded ? 'flagged' : c.reviewedOkAt ? 'ok' : 'pending');

const format = (c) => {
  const names = buildNames(c.story);
  return {
    checkpointId: c.id,
    createdAt: c.story.createdAt,
    type: c.type,
    skill: c.subSkill?.skill ? { id: c.subSkill.skill.id, caselCode: c.subSkill.skill.caselCode, nameVi: c.subSkill.skill.nameVi } : null,
    subSkill: c.subSkill ? { id: c.subSkill.id, nameVi: c.subSkill.nameVi } : null,
    template: c.templateVersion ? { id: c.templateVersion.template.id, title: c.templateVersion.template.title, version: c.templateVersion.version } : null,
    pageBefore: mask(c.afterPage.contentText, names),
    question: mask(c.question, names),
    options: c.options.map((o) => ({
      text: mask(o.text, names),
      ...(o.role && { role: o.role }),
      ...(o.isCorrect !== null && { isCorrect: o.isCorrect }),
    })),
    ...(c.answerEmotion && { answerEmotion: c.answerEmotion }),
    status: statusOf(c),
    ...(c.excluded && { excludedReason: c.excludedReason }),
  };
};

/** Chi diem cham diem cua truyen AI (khac tu viet), ke ca ban published. */
const REVIEWABLE = { scored: true, story: { length: { not: 'custom' }, deletedAt: null } };

async function listQueue({ status, skillId, subSkillId, templateId, cursor, limit = 20 }) {
  const where = {
    ...REVIEWABLE,
    ...(status === 'pending' && { excluded: false, reviewedOkAt: null }),
    ...(status === 'ok' && { excluded: false, reviewedOkAt: { not: null } }),
    ...(status === 'flagged' && { excluded: true }),
    ...(subSkillId && { subSkillId }),
    ...(skillId && { subSkill: { skillId } }),
    ...(templateId && { templateVersion: { templateId } }),
  };
  const rows = await prisma.storyCheckpoint.findMany({
    where,
    include: INCLUDE,
    orderBy: [{ story: { createdAt: 'desc' } }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });
  const page = rows.slice(0, limit);
  return { items: page.map(format), nextCursor: rows.length > limit ? page[page.length - 1].id : null };
}

async function findReviewable(id) {
  const c = await prisma.storyCheckpoint.findUnique({ where: { id }, select: { id: true, scored: true, story: { select: { length: true } } } });
  if (!c) throw ApiError.notFound('Không tìm thấy điểm dừng');
  if (!c.scored || c.story.length === 'custom') {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Chỉ soát được điểm dừng chấm điểm của truyện AI');
  }
  return c;
}

async function markOk(user, id) {
  await findReviewable(id);
  await prisma.storyCheckpoint.update({ where: { id }, data: { reviewedOkAt: new Date(), reviewedOkBy: user.id } });
  return { checkpointId: id, status: 'ok' };
}

async function flag(user, id, reason) {
  await findReviewable(id);
  await prisma.storyCheckpoint.update({
    where: { id },
    data: { excluded: true, excludedReason: reason, excludedBy: user.id, excludedAt: new Date(), reviewedOkAt: null, reviewedOkBy: null },
  });
  return { checkpointId: id, status: 'flagged' };
}

async function unflag(id) {
  const c = await prisma.storyCheckpoint.findUnique({ where: { id }, select: { id: true } });
  if (!c) throw ApiError.notFound('Không tìm thấy điểm dừng');
  await prisma.storyCheckpoint.update({ where: { id }, data: { excluded: false, excludedReason: null, excludedBy: null, excludedAt: null } });
  return { checkpointId: id, status: 'pending' };
}

/** Theo mau (gop moi phien ban): reviewed = ok + flagged. */
async function stats() {
  const rows = await prisma.storyCheckpoint.findMany({
    where: { ...REVIEWABLE, templateVersionId: { not: null }, OR: [{ excluded: true }, { reviewedOkAt: { not: null } }] },
    select: { excluded: true, templateVersion: { select: { template: { select: { id: true, title: true } } } } },
  });
  const by = new Map();
  for (const r of rows) {
    const t = r.templateVersion.template;
    const e = by.get(t.id) ?? { templateId: t.id, title: t.title, reviewed: 0, flagged: 0 };
    e.reviewed += 1;
    if (r.excluded) e.flagged += 1;
    by.set(t.id, e);
  }
  return [...by.values()].sort((a, b) => b.reviewed - a.reviewed || a.title.localeCompare(b.title));
}

export default { listQueue, markOk, flag, unflag, stats };
