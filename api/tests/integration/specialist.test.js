import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, createChild, createCharacter, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let skills;

before(async () => {
  if (skip) return;
  api = await startServer();
  skills = Object.fromEntries((await prisma.eqSkill.findMany()).map((s) => [s.caselCode, s]));
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

  const upd = await call(mod.token, 'PUT', `/topics/${t.id}`, { isActive: true, skillId: skills.self_awareness.id });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.data.skill.caselCode, 'self_awareness', 'chua co truyen -> doi nang luc duoc');
  assert.ok((await call(parent.token, 'GET', '/topics')).body.data.some((x) => x.id === t.id));
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
