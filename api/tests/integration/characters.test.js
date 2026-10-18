import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createChild, createCharacter, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;

before(async () => {
  if (skip) return;
  api = await startServer();
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

const call = (token, method, path, body) => api.request(method, path, { token, body });

test('nhan vat gia dinh: them / sua / xoa; nhan vat cua be khong doi ten, khong xoa o day; dem so truyen dung', { skip }, async () => {
  const f = await createParent();
  const child = await createChild(f.user.id, 'Bin');
  const kidChar = await createCharacter(f.user.id, 'Bin', { childId: child.id });

  const created = await call(f.token, 'POST', '/characters', { name: 'Bà nội', appearance: 'tóc bạc, hiền, hay kể chuyện' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.character?.id ?? created.body.data.id;
  const bad = await call(f.token, 'POST', '/characters', { name: '', appearance: 'x' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.errors[0].message, /Nhập tên nhân vật|tối thiểu/);

  assert.equal((await call(f.token, 'PUT', `/characters/${id}`, { name: 'Bà ngoại' })).status, 200);
  const rename = await call(f.token, 'PUT', `/characters/${kidChar.id}`, { name: 'Bông' });
  assert.equal(rename.status, 422);
  assert.match(rename.body.message, /Bé nhà mình/);
  assert.equal((await call(f.token, 'PUT', `/characters/${kidChar.id}`, { appearance: 'tóc xoăn, thích khủng long' })).status, 200);
  assert.equal((await call(f.token, 'DELETE', `/characters/${kidChar.id}`)).status, 422);

  const list = (await call(f.token, 'GET', '/characters')).body.data;
  const rows = list.characters ?? list;
  assert.equal(rows.find((c) => c.id === id).storiesCount, 0);
  assert.equal((await call(f.token, 'DELETE', `/characters/${id}`)).status, 200);
});

test('moi be mot nhan vat "la be": tao them -> 409; khong go / chuyen nhan vat cua be; trang thai chan dung do server suy ra', { skip }, async () => {
  const f = await createParent();
  const bin = await createChild(f.user.id, 'Bin');
  const na = await createChild(f.user.id, 'Na');
  const kidChar = await createCharacter(f.user.id, 'Bin', { childId: bin.id });

  const dup = await call(f.token, 'POST', '/characters', { name: 'Bin 2', appearance: 'tóc ngắn, áo xanh', childId: bin.id });
  assert.equal(dup.status, 409, JSON.stringify(dup.body));
  assert.equal((await call(f.token, 'PUT', `/characters/${kidChar.id}`, { childId: null })).status, 422);
  assert.equal((await call(f.token, 'PUT', `/characters/${kidChar.id}`, { childId: na.id })).status, 422);
  assert.equal((await call(f.token, 'PUT', `/characters/${kidChar.id}`, { childId: bin.id, appearance: 'tóc xoăn' })).status, 200);

  // Dong da xoa mem dang giu child_id -> nha cho cho nhan vat moi.
  const ghost = await createCharacter(f.user.id, 'Na cũ', { childId: na.id });
  await prisma.character.update({ where: { id: ghost.id }, data: { deletedAt: new Date() } });
  const naChar = await call(f.token, 'POST', '/characters', { name: 'Na', appearance: 'tóc dài, váy hồng', childId: na.id });
  assert.equal(naChar.status, 201, JSON.stringify(naChar.body));
  assert.equal((await prisma.character.findUnique({ where: { id: ghost.id } })).childId, null);

  const grandma = (await call(f.token, 'POST', '/characters', { name: 'Bà', appearance: 'tóc bạc búi gọn' })).body.data;
  const gid = grandma.character?.id ?? grandma.id;
  let res = await call(f.token, 'PUT', `/characters/${gid}`, { portraitImageKey: 'portraits/ba.png', portraitStatus: 'failed' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await prisma.character.findUnique({ where: { id: gid } })).portraitStatus, 'ready');
  res = await call(f.token, 'PUT', `/characters/${gid}`, { portraitImageKey: null });
  assert.equal((await prisma.character.findUnique({ where: { id: gid } })).portraitStatus, 'none');
});
