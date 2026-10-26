import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, startServer } from './_fixtures.js';
import { CASEL_REFERENCES } from '../../prisma/data/casel.js';

// Ky nang con CHINH LA muc CASEL (1 tang, nguoi dung chot 2026-10-21): 40 muc goc, seed
// Danh muc chuan (chot 2026-10-22): khong them / xoa, chi dieu chinh dien giai tieng Viet, do tuoi, bat/tat.
const skip = !hasTestDb;
let api;
let skills;

before(async () => {
  if (skip) return;
  api = await startServer();
  skills = Object.fromEntries((await prisma.eqSkill.findMany()).map((s) => [s.caselCode, s]));
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

const call = (token, method, path, body) => api.request(method, path, { token, body });
const caselRow = (code = 'sa_emotion_naming') => prisma.eqSubSkill.findUnique({ where: { code } });

// DB test tich luy ky nang con do fixture tao; 40 muc goc nhan ra qua nguyen van tieng Anh.
const CASEL_TEXTS = new Set(CASEL_REFERENCES.map((c) => c.textEn));

test('40 muc goc CASEL la ky nang con, co nguyen van tieng Anh; khong tra `source`', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const list = await call(mod.token, 'GET', '/sub-skills');
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const casel = list.body.data.filter((x) => CASEL_TEXTS.has(x.caselTextEn));
  assert.equal(casel.length, 40);
  assert.equal(new Set(casel.map((x) => x.caselTextEn)).size, 40);
  assert.ok(list.body.data.every((x) => typeof x.caselTextEn === 'string' && !('source' in x)));
  assert.ok(casel.every((x) => x.nameVi && x.skill?.caselCode));
  const emo = list.body.data.find((x) => x.code === 'sa_emotion_naming');
  assert.equal(emo.caselTextEn, "Identifying one's emotions");
  assert.equal((await call(undefined, 'GET', '/eq-skills/casel-references')).status, 404);
});

test('danh muc chuan: khong them / xoa qua API (404)', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const row = await caselRow();
  const before = await prisma.eqSubSkill.count({ where: { caselTextEn: { in: [...CASEL_TEXTS] } } });
  const add = await call(mod.token, 'POST', '/sub-skills', {
    skillId: skills.self_management.id, nameVi: 'Kỹ năng thử thêm', descriptionVi: 'Bé biết hít thở sâu khi thấy giận.',
  });
  assert.equal(add.status, 404, JSON.stringify(add.body));
  assert.equal((await call(mod.token, 'DELETE', `/sub-skills/${row.id}`)).status, 404);
  assert.equal(await prisma.eqSubSkill.count({ where: { caselTextEn: { in: [...CASEL_TEXTS] } } }), before);
  assert.ok(await caselRow());
});

test('dieu chinh: chi sua ten / mo ta / do tuoi / bat-tat; nang luc / ma / cau tieng Anh -> 400; phu huynh -> 403', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const parent = await createParent();
  const row = await caselRow();
  const put = (b, token = mod.token) => call(token, 'PUT', `/sub-skills/${row.id}`, b);
  assert.equal((await put({ nameVi: row.nameVi }, parent.token)).status, 403);
  for (const b of [{ caselTextEn: 'Something else' }, { skillId: skills.self_management.id }, { code: 'sa_khac_ma' }, { displayOrder: 3 }, {}]) {
    assert.equal((await put(b)).status, 400, JSON.stringify(b));
  }
  assert.equal((await put({ ageMin: 9, ageMax: 6 })).status, 400);
  assert.equal((await put({ ageMin: row.ageMax + 1 })).status, 400, 'so voi tuoi toi da dang luu');

  const ok = await put({ nameVi: `${row.nameVi} `, descriptionVi: row.descriptionVi, ageMin: row.ageMin, ageMax: row.ageMax });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.nameVi, row.nameVi, 'trim ten');
  const after = await caselRow();
  assert.equal(after.caselTextEn, row.caselTextEn);
  assert.equal(after.skillId, row.skillId);
  assert.equal(after.code, row.code);
  assert.equal((await call(mod.token, 'PUT', '/sub-skills/00000000-0000-4000-8000-000000000000', { isActive: true })).status, 404);
});

test('bat/tat: phu huynh chi thay ban dang dung va khong kem so dem', { skip }, async () => {
  const mod = await createUser({ role: 'specialist' });
  const parent = await createParent();
  const inactive = await prisma.eqSubSkill.findFirst({ where: { caselTextEn: { in: [...CASEL_TEXTS] }, isActive: false } });
  const parentIds = async () => (await call(parent.token, 'GET', '/sub-skills')).body.data.map((x) => x.id);
  assert.ok(!(await parentIds()).includes(inactive.id), 'ban tat an voi phu huynh');
  const parentList = (await call(parent.token, 'GET', '/sub-skills')).body.data;
  assert.ok(parentList.every((x) => x.templatesCount === undefined && x.checkpointsCount === undefined));

  try {
    const on = await call(mod.token, 'PUT', `/sub-skills/${inactive.id}`, { isActive: true });
    assert.equal(on.status, 200, JSON.stringify(on.body));
    assert.equal(on.body.data.isActive, true);
    assert.equal(typeof on.body.data.topicsCount, 'number');
    assert.ok((await parentIds()).includes(inactive.id));
    const modList = (await call(mod.token, 'GET', `/sub-skills?skillId=${inactive.skillId}&isActive=true`)).body.data;
    assert.ok(modList.some((x) => x.id === inactive.id));
  } finally {
    assert.equal((await call(mod.token, 'PUT', `/sub-skills/${inactive.id}`, { isActive: false })).status, 200);
  }
});
