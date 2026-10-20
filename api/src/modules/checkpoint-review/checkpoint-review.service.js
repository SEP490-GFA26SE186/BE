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
const maskTokens = (text, names) => {
  if (text == null) return text;
  // Token la khong co trong bang (hiem) -> ten chung tiep theo, khong bao gio de lo token
  return text.replace(TOKEN_RE, (t) => {
    if (!names.has(t)) names.set(t, `Bạn ${LABELS[names.size] ?? names.size + 1}`);
    return names.get(t);
  });
};

// Lop chan phu: neu AI lam sot ten that (khac hoa/thuong, bien the) trong van ban thi van che.
// Ten that chi dung de so khop, khong bao gio dua vao phan hoi hay log.
const UNMATCHED = '';
const norm = (s) => s.normalize('NFC');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** storyId -> [{ re, token|null }]: ten nhan vat cua truyen (gan token) + ten ho so be cua chu truyen (khong token). */
async function loadScrubbers(stories) {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const chars = await prisma.storyCharacter.findMany({
    where: { storyId: { in: [...byId.keys()] }, characterId: { not: null } },
    select: { storyId: true, token: true, character: { select: { name: true } } },
  });
  const ownerIds = [...new Set(stories.map((s) => s.ownerId))];
  const kids = await prisma.childProfile.findMany({ where: { parentId: { in: ownerIds } }, select: { parentId: true, name: true } });
  const out = new Map();
  for (const s of stories) {
    const entries = [];
    for (const c of chars) if (c.storyId === s.id && c.character?.name) entries.push({ name: norm(c.character.name.trim()), token: c.token });
    for (const k of kids) if (k.parentId === s.ownerId && k.name) entries.push({ name: norm(k.name.trim()), token: null });
    entries.sort((a, b) => b.name.length - a.name.length);
    out.set(
      s.id,
      entries
        .filter((e) => e.name)
        .map((e) => ({ re: new RegExp(`(?<![\\p{L}\\p{N}])${esc(e.name)}(?![\\p{L}\\p{N}])`, 'giu'), token: e.token })),
    );
  }
  return out;
}
const scrub = (text, scrubbers) => {
  if (text == null) return text;
  let t = norm(text);
  for (const { re, token } of scrubbers) t = t.replace(re, token ?? UNMATCHED);
  return t;
};

const INCLUDE = {
  story: { select: { id: true, ownerId: true, kind: true, createdAt: true, storyCharacters: { select: { token: true, aliasName: true, isMain: true } } } },
  afterPage: { select: { contentText: true } },
  options: { orderBy: { optionOrder: 'asc' }, select: { text: true, role: true, isCorrect: true } },
  subSkill: { select: { id: true, nameVi: true, skill: { select: { id: true, caselCode: true, nameVi: true } } } },
  templateVersion: { select: { version: true, template: { select: { id: true, title: true } } } },
};

const statusOf = (c) => (c.excluded ? 'flagged' : c.reviewedOkAt ? 'ok' : 'pending');

const format = (c, scrubbers = []) => {
  const names = buildNames(c.story);
  const mask = (text, n) => maskTokens(scrub(text, scrubbers), n)?.replaceAll(UNMATCHED, 'Bạn ?') ?? text;
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
  const scrubbers = await loadScrubbers([...new Map(page.map((c) => [c.story.id, c.story])).values()]);
  return { items: page.map((c) => format(c, scrubbers.get(c.story.id))), nextCursor: rows.length > limit ? page[page.length - 1].id : null };
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
  // "On" = khoi phuc + duyet: xoa co loai neu co
  const row = await prisma.storyCheckpoint.update({
    where: { id },
    data: { excluded: false, excludedReason: null, excludedBy: null, excludedAt: null, reviewedOkAt: new Date(), reviewedOkBy: user.id },
  });
  return { checkpointId: id, status: statusOf(row) };
}

async function flag(user, id, reason) {
  await findReviewable(id);
  const row = await prisma.storyCheckpoint.update({
    where: { id },
    data: { excluded: true, excludedReason: reason, excludedBy: user.id, excludedAt: new Date(), reviewedOkAt: null, reviewedOkBy: null },
  });
  return { checkpointId: id, status: statusOf(row) };
}

async function unflag(id) {
  const c = await prisma.storyCheckpoint.findUnique({ where: { id }, select: { id: true } });
  if (!c) throw ApiError.notFound('Không tìm thấy điểm dừng');
  const row = await prisma.storyCheckpoint.update({ where: { id }, data: { excluded: false, excludedReason: null, excludedBy: null, excludedAt: null } });
  return { checkpointId: id, status: statusOf(row) };
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
