import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, createChild, createCharacter, getSeededTopic, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let skills;
let refs; // caselCode -> cac muc tham chieu cua nang luc do

before(async () => {
  if (skip) return;
  api = await startServer();
  skills = Object.fromEntries((await prisma.eqSkill.findMany()).map((s) => [s.caselCode, s]));
  const all = await prisma.caselReference.findMany({ orderBy: { displayOrder: 'asc' } });
  refs = {};
  for (const s of Object.values(skills)) refs[s.caselCode] = all.filter((r) => r.skillId === s.id);
});

// Fixture khong don; tat cac ky nang con thu de khong lam nhieu danh sach dung that.
after(async () => {
  if (!skip) {
    await prisma.eqSubSkill.updateMany({ where: { nameVi: { startsWith: 'Kỹ năng thử' } }, data: { isActive: false } });
    await prisma.topic.updateMany({ where: { title: { startsWith: 'Bài học thử ks' } }, data: { isActive: false } });
  }
  if (api) await api.close();
  await prisma.$disconnect();
});

const call = (token, method, path, body) => api.request(method, path, { token, body });
let seq = 0;
const body = (over = {}) => ({
  skillId: skills.self_management.id,
  caselReferenceId: refs.self_management[0].id,
  nameVi: `Kỹ năng thử ${Date.now()}_${seq++}`,
  descriptionVi: 'Bé biết hít thở sâu khi thấy giận.',
  ageMin: 5,
  ageMax: 8,
  ...over,
});

// Gan 1 story_checkpoint dung ky nang con (qua truyen that tao bang API).
async function attachCheckpoint(subSkillId) {
  const topic = await getSeededTopic();
  const parent = await createParent();
  const child = await createChild(parent.user.id, 'Bin');
  const bin = await createCharacter(parent.user.id, 'Bin', { childId: child.id });
  const res = await call(parent.token, 'POST', '/stories', {
    topicId: topic.id, length: 'custom', title: 'Truyện', useTts: false, characters: [{ characterId: bin.id, isMain: true }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const page = await prisma.storyPage.findFirst({ where: { storyId: res.body.data.story.id } });
  await prisma.storyCheckpoint.create({
    data: { storyId: page.storyId, afterPageId: page.id, type: 'emotion_self', question: '{NV1} thấy sao?', answerEmotion: 'angry', subSkillId },
  });
}

test('casel-references: can dang nhap, loc theo skillId', { skip }, async () => {
  const parent = await createParent();
  assert.equal((await call(undefined, 'GET', '/eq-skills/casel-references')).status, 401);
  const all = await call(parent.token, 'GET', '/eq-skills/casel-references');
  assert.equal(all.status, 200, JSON.stringify(all.body));
  assert.ok(all.body.data.length >= 40);
  const filtered = (await call(parent.token, 'GET', `/eq-skills/casel-references?skillId=${skills.self_management.id}`)).body.data;
  assert.ok(filtered.length > 0 && filtered.every((r) => r.skillId === skills.self_management.id && r.textEn && r.code));
});

test('ky nang con: phu huynh khong tao duoc; sai nang luc -> 400; tao OK -> 201 kem caselReference', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const parent = await createParent();
  assert.equal((await call(parent.token, 'POST', '/sub-skills', body())).status, 403);
  const wrong = await call(mod.token, 'POST', '/sub-skills', body({ caselReferenceId: refs.self_awareness[0].id }));
  assert.equal(wrong.status, 400, JSON.stringify(wrong.body));
  assert.equal((await call(mod.token, 'POST', '/sub-skills', body({ ageMin: 9, ageMax: 6 }))).status, 400);

  const ok = await call(mod.token, 'POST', '/sub-skills', body());
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const s = ok.body.data;
  assert.equal(s.caselReference.textEn, refs.self_management[0].textEn);
  assert.match(s.code, /^[a-z0-9_]+$/);
  assert.ok(s.code.startsWith(refs.self_management[0].code));
  assert.equal(s.templatesCount, 0);
  const again = await call(mod.token, 'POST', '/sub-skills', body());
  assert.equal(again.status, 201, JSON.stringify(again.body));
  assert.notEqual(again.body.data.code, s.code);
  assert.equal((await call(mod.token, 'POST', '/sub-skills', body({ code: s.code }))).status, 409);
});

test('ky nang con: phu huynh chi thay ban dang dung va khong kem count; khoa doi muc khi co checkpoint', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const parent = await createParent();
  const s = (await call(mod.token, 'POST', '/sub-skills', body({ isActive: false }))).body.data;
  const modList = (await call(mod.token, 'GET', `/sub-skills?skillId=${skills.self_management.id}&isActive=false`)).body.data;
  const mine = modList.find((x) => x.id === s.id);
  assert.ok(mine);
  assert.equal(mine.skill.caselCode, 'self_management');
  assert.equal(mine.topicsCount, 0);
  assert.equal(mine.checkpointsCount, 0);
  const parentList = (await call(parent.token, 'GET', '/sub-skills')).body.data;
  assert.ok(!parentList.some((x) => x.id === s.id), 'ban tat an voi phu huynh');
  assert.ok(parentList.every((x) => x.templatesCount === undefined && x.checkpointsCount === undefined));

  const upd = await call(mod.token, 'PUT', `/sub-skills/${s.id}`, { isActive: true, nameVi: `Kỹ năng thử sửa ${Date.now()}` });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.ok((await call(parent.token, 'GET', '/sub-skills')).body.data.some((x) => x.id === s.id));
  assert.equal((await call(mod.token, 'PUT', `/sub-skills/${s.id}`, { caselReferenceId: refs.self_awareness[0].id })).status, 400);
  assert.equal((await call(mod.token, 'PUT', `/sub-skills/${s.id}`, { caselReferenceId: refs.self_management[1].id })).status, 200);

  await attachCheckpoint(s.id);
  const lock = await call(mod.token, 'PUT', `/sub-skills/${s.id}`, { caselReferenceId: refs.self_management[0].id });
  assert.equal(lock.status, 422, JSON.stringify(lock.body));
  assert.equal((await call(mod.token, 'PUT', `/sub-skills/${s.id}`, { nameVi: `Kỹ năng thử khoá ${Date.now()}` })).status, 200);
  const del = await call(mod.token, 'DELETE', `/sub-skills/${s.id}`);
  assert.equal(del.status, 409);
  assert.match(del.body.message, /chỉ tắt được/);
  assert.equal((await call(mod.token, 'GET', '/sub-skills')).body.data.find((x) => x.id === s.id).checkpointsCount, 1);
});

test('ky nang con: xoa khi da gan topic -> 409; tat OK; chua dung -> xoa han', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const s = (await call(mod.token, 'POST', '/sub-skills', body())).body.data;
  const topic = await call(mod.token, 'POST', '/topics', {
    title: `Bài học thử ks ${Date.now()}`,
    skillId: skills.self_management.id,
    subSkillIds: [(await prisma.eqSubSkill.findFirst({ where: { skillId: skills.self_management.id, isActive: true, templates: { some: { isActive: true, versions: { some: { status: 'published' } } } } } })).id],
    guidance: 'Giúp bé hít thở và nói ra cảm xúc khi giận.',
    isActive: false,
  });
  assert.equal(topic.status, 201, JSON.stringify(topic.body));
  await prisma.topicSubSkill.create({ data: { topicId: topic.body.data.id, subSkillId: s.id } });
  const del = await call(mod.token, 'DELETE', `/sub-skills/${s.id}`);
  assert.equal(del.status, 409, JSON.stringify(del.body));
  assert.match(del.body.message, /chỉ tắt được/);
  const off = await call(mod.token, 'PUT', `/sub-skills/${s.id}`, { isActive: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.data.isActive, false);
  assert.equal((await call(mod.token, 'GET', '/sub-skills')).body.data.find((x) => x.id === s.id).topicsCount, 1);

  const fresh = (await call(mod.token, 'POST', '/sub-skills', body())).body.data;
  assert.equal((await call(mod.token, 'DELETE', `/sub-skills/${fresh.id}`)).status, 200);
  assert.equal((await call(mod.token, 'DELETE', `/sub-skills/${fresh.id}`)).status, 404);
});
