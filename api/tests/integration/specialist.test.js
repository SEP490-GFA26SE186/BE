import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, createChild, createCharacter, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let skills;
let usable; // caselCode -> ky nang con dang bat, co mau ban hanh (seed)

before(async () => {
  if (skip) return;
  api = await startServer();
  skills = Object.fromEntries((await prisma.eqSkill.findMany()).map((s) => [s.caselCode, s]));
  usable = {};
  for (const s of Object.values(skills)) {
    usable[s.caselCode] = await prisma.eqSubSkill.findMany({
      where: { skillId: s.id, isActive: true, ageMin: { lte: 8 }, ageMax: { gte: 5 }, templates: { some: { isActive: true, versions: { some: { status: 'published' } } } } },
      orderBy: { displayOrder: 'asc' },
    });
  }
});

// Bai hoc thu nam cuoi danh sach va ngung dung khi xong: getSeededTopic() cua test khac lay bai dang dung dau tien.
after(async () => {
  if (!skip) await prisma.topic.updateMany({ where: { title: { startsWith: 'Bài học thử' } }, data: { isActive: false } });
  if (api) await api.close();
  await prisma.$disconnect();
});

const call = (token, method, path, body) => api.request(method, path, { token, body });
const topicBody = (over = {}) => ({
  title: `Bài học thử ${Date.now()}`,
  skillId: skills.self_management.id,
  subSkillIds: usable.self_management.slice(0, 1).map((x) => x.id),
  guidance: 'Giúp bé hít thở và nói ra cảm xúc khi giận.',
  ageMin: 5,
  ageMax: 8,
  displayOrder: 999,
  ...over,
});

test('bai hoc: Specialist tao / sua; phu huynh khong tao duoc, chi thay bai dang dung va khong thay guidance', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const parent = await createParent();
  assert.equal((await call(parent.token, 'POST', '/topics', topicBody())).status, 403);
  const bad = await call(mod.token, 'POST', '/topics', topicBody({ ageMin: 9, ageMax: 6 }));
  assert.equal(bad.status, 400);

  const created = await call(mod.token, 'POST', '/topics', topicBody({ isActive: false }));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const t = created.body.data;
  assert.equal(t.storiesCount, 0);
  const modList = (await call(mod.token, 'GET', '/topics')).body.data;
  assert.ok(modList.some((x) => x.id === t.id && x.guidance));
  const parentList = (await call(parent.token, 'GET', '/topics')).body.data;
  assert.ok(!parentList.some((x) => x.id === t.id), 'bai ngung dung an voi phu huynh');
  assert.ok(parentList.every((x) => x.guidance === undefined));

  const upd = await call(mod.token, 'PUT', `/topics/${t.id}`, { isActive: true, skillId: skills.self_awareness.id, subSkillIds: [usable.self_awareness[0].id] });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.data.skill.caselCode, 'self_awareness', 'chua co truyen -> doi nang luc duoc');
  assert.ok((await call(parent.token, 'GET', '/topics')).body.data.some((x) => x.id === t.id));
});

test('bai hoc: gan 1-3 ky nang con, kiem cung nang luc / giao tuoi / co mau ban hanh', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const parent = await createParent();
  const two = usable.self_management.slice(0, 2).map((x) => x.id);
  const post = (over) => call(mod.token, 'POST', '/topics', topicBody(over));

  const { subSkillIds: _omit, ...noSub } = topicBody();
  assert.equal((await call(mod.token, 'POST', '/topics', noSub)).status, 400, 'thieu subSkillIds');
  assert.equal((await post({ subSkillIds: [] })).status, 400);
  assert.equal((await post({ subSkillIds: [two[0], two[0]] })).status, 400, 'trung');
  const four = [...usable.self_management, ...usable.self_awareness].slice(0, 4).map((x) => x.id);
  assert.equal((await post({ subSkillIds: four })).status, 400, '4 ky nang con');

  const other = await post({ subSkillIds: [usable.self_awareness[0].id] });
  assert.equal(other.status, 422, JSON.stringify(other.body));
  assert.ok(other.body.message.includes(usable.self_awareness[0].nameVi));

  const old = await prisma.eqSubSkill.create({
    data: {
      skillId: skills.self_management.id, code: `thu_${Date.now()}`,
      nameVi: `Kỹ năng thử tuổi ${Date.now()}`, descriptionVi: 'x', ageMin: 12, ageMax: 15, createdBy: mod.user.id,
    },
  });
  const noAge = await post({ subSkillIds: [old.id] });
  assert.equal(noAge.status, 422, JSON.stringify(noAge.body));
  assert.ok(noAge.body.message.includes(old.nameVi));

  const nameNoTpl = `Kỹ năng thử chưa mẫu ${Date.now()}`;
  const noTpl = await prisma.eqSubSkill.create({
    data: { skillId: skills.self_management.id, code: `thu2_${Date.now()}`, nameVi: nameNoTpl, descriptionVi: 'x', createdBy: mod.user.id },
  });
  const noPub = await post({ subSkillIds: [noTpl.id] });
  assert.equal(noPub.status, 422, JSON.stringify(noPub.body));
  assert.ok(noPub.body.message.includes(nameNoTpl));
  await prisma.eqSubSkill.updateMany({ where: { id: { in: [old.id, noTpl.id] } }, data: { isActive: false } });

  const ok = await post({ subSkillIds: two });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.data.subSkills.length, 2);
  assert.ok(ok.body.data.subSkills.every((x) => x.id && x.nameVi && 'caselTextEn' in x && ['casel', 'specialist'].includes(x.source)));
  const pl = (await call(parent.token, 'GET', '/topics')).body.data;
  // Chi kiem bai vua tao: DB test tich luy bai hoc cua cac lan chay khac (co the chua gan ky nang con).
  const mine = pl.find((x) => x.id === ok.body.data.id);
  assert.ok(mine && mine.subSkills.length === 2 && mine.subSkills.every((y) => y.id && y.nameVi && y.caselTextEn === undefined && y.source === undefined));
  assert.ok(pl.every((x) => Array.isArray(x.subSkills)));

  // update: thay toan bo lien ket; doi nang luc ma khong gui subSkillIds -> 422; doi tuoi khong giao -> 422
  const id = ok.body.data.id;
  const swap = await call(mod.token, 'PUT', `/topics/${id}`, { subSkillIds: [two[1]] });
  assert.equal(swap.status, 200, JSON.stringify(swap.body));
  assert.deepEqual(swap.body.data.subSkills.map((x) => x.id), [two[1]]);
  assert.equal((await call(mod.token, 'PUT', `/topics/${id}`, { skillId: skills.self_awareness.id })).status, 422);
  assert.equal((await call(mod.token, 'PUT', `/topics/${id}`, { subSkillIds: [usable.self_awareness[0].id] })).status, 422);
  const ages = await call(mod.token, 'PUT', `/topics/${id}`, { ageMin: 16, ageMax: 17 });
  assert.equal(ages.status, 422, JSON.stringify(ages.body));
  assert.equal((await prisma.topicSubSkill.count({ where: { topicId: id } })), 1, 'loi thi giu nguyen lien ket');
});

test('bai hoc da co truyen: khoa doi nang luc; xoa -> chuyen ngung dung; bai chua dung -> xoa han', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const used = (await call(mod.token, 'POST', '/topics', topicBody())).body.data;
  const parent = await createParent();
  const child = await createChild(parent.user.id, 'Bin');
  const bin = await createCharacter(parent.user.id, 'Bin', { childId: child.id });
  const s = await call(parent.token, 'POST', '/stories', { topicId: used.id, length: 'custom', title: 'Truyện', useTts: false, characters: [{ characterId: bin.id, isMain: true }] });
  assert.equal(s.status, 201, JSON.stringify(s.body));

  const lock = await call(mod.token, 'PUT', `/topics/${used.id}`, { skillId: skills.social_awareness.id });
  assert.equal(lock.status, 422);
  assert.match(lock.body.message, /không đổi được năng lực/);
  assert.equal((await call(mod.token, 'PUT', `/topics/${used.id}`, { guidance: 'Hướng dẫn mới cho AI viết truyện.' })).status, 200);

  const del = await call(mod.token, 'DELETE', `/topics/${used.id}`);
  assert.equal(del.body.data.deactivated, true);
  assert.equal((await prisma.topic.findUnique({ where: { id: used.id } })).isActive, false);

  const unused = (await call(mod.token, 'POST', '/topics', topicBody())).body.data;
  assert.equal((await call(mod.token, 'DELETE', `/topics/${unused.id}`)).body.data.deleted, true);
  assert.equal(await prisma.topic.findUnique({ where: { id: unused.id } }), null);
});

test('tu khoa: them / trung / them nhieu / sua / xoa; chuan hoa chu thuong', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const kw = `từ thử ${Date.now()}`;
  const a = await call(mod.token, 'POST', '/moderation/keywords', { keyword: kw.toUpperCase(), severity: 'warn' });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.data.keyword.keyword, kw);
  assert.equal((await call(mod.token, 'POST', '/moderation/keywords', { keyword: kw })).status, 409);
  const bulk = await call(mod.token, 'POST', '/moderation/keywords/bulk', { keywords: [kw, `${kw} hai`], severity: 'block' });
  assert.equal(bulk.body.data.count, 2);
  assert.equal((await prisma.blockedKeyword.findUnique({ where: { keyword: kw } })).severity, 'block');
  const id = a.body.data.keyword.id;
  assert.equal((await call(mod.token, 'PUT', `/moderation/keywords/${id}`, { isActive: false })).body.data.keyword.isActive, false);
  assert.equal((await call(mod.token, 'DELETE', `/moderation/keywords/${id}`)).status, 200);
  await prisma.blockedKeyword.deleteMany({ where: { keyword: `${kw} hai` } });
});

test('editor: tu `block` chan han (khong luu, 422 dung o), `warn` luu + canh bao; hoan tat kiem ca truyen', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const tag = Date.now();
  const blockWord = `đánh nhau${tag}`;
  const warnWord = `hư${tag}`;
  await prisma.blockedKeyword.createMany({ data: [{ keyword: blockWord, severity: 'block', createdBy: mod.user.id }, { keyword: warnWord, severity: 'warn', createdBy: mod.user.id }] });
  try {
    const parent = await createParent();
    const child = await createChild(parent.user.id, 'Bin');
    const bin = await createCharacter(parent.user.id, 'Bin', { childId: child.id });
    const topic = await prisma.topic.findFirst({ where: { isActive: true } });
    const story = (await call(parent.token, 'POST', '/stories', { topicId: topic.id, length: 'custom', title: 'T', useTts: false, characters: [{ characterId: bin.id, isMain: true }] })).body.data.story;
    const page = story.pages[0];

    const blocked = await call(parent.token, 'PUT', `/stories/${story.id}/pages/${page.id}`, { contentText: `Hai bạn ${blockWord.toUpperCase()} ở sân.` });
    assert.equal(blocked.status, 422);
    assert.equal(blocked.body.errors[0].path, `pages.${page.id}`);
    assert.equal((await prisma.storyPage.findUnique({ where: { id: page.id } })).contentText, null, 'khong luu');

    const warned = await call(parent.token, 'PUT', `/stories/${story.id}/pages/${page.id}`, { contentText: `Bin không ${warnWord} đâu.` });
    assert.equal(warned.status, 200, JSON.stringify(warned.body));
    assert.deepEqual(warned.body.data.story.keywordWarnings.map((w) => [w.path, w.severity]), [[`pages.${page.id}`, 'warn']]);

    // Chu co tu `block` lot vao (vd. danh sach doi sau khi viet) -> hoan tat bi chan
    for (const p of story.pages) await prisma.storyPage.update({ where: { id: p.id }, data: { contentText: `{NV1} trang ${p.pageOrder}.` } });
    await prisma.storyPage.update({ where: { id: story.pages[2].id }, data: { contentText: `{NV1} ${blockWord}.` } });
    const review = await call(parent.token, 'POST', `/stories/${story.id}/review`);
    assert.equal(review.status, 422);
    assert.equal(review.body.errors[0].path, `pages.${story.pages[2].id}`);
    assert.equal((await prisma.story.findUnique({ where: { id: story.id } })).reviewedAt, null);
  } finally {
    await prisma.blockedKeyword.deleteMany({ where: { keyword: { in: [blockWord, warnWord] } } });
  }
});
