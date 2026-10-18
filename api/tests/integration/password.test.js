import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let tokens;

before(async () => {
  if (skip) return;
  api = await startServer();
  tokens = await import('../../src/modules/auth/token.service.js');
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

const login = (user, password) => api.request('POST', '/auth/login', { body: { emailOrUsername: user.email, password } });

test('doi mat khau: sai mat khau hien tai -> 400; dung -> dang nhap bang mat khau moi', { skip }, async () => {
  const f = await createParent();
  const old = 'Matkhau123';
  await prisma.user.update({ where: { id: f.user.id }, data: { passwordHash: await (await import('bcryptjs')).default.hash(old, 10) } });
  const wrong = await api.request('PUT', '/auth/change-password', { token: f.token, body: { currentPassword: 'sai-roi', newPassword: 'MatKhauMoi1' } });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.message, 'Account password is incorrect');
  assert.equal((await api.request('PUT', '/auth/change-password', { token: f.token, body: { currentPassword: old, newPassword: 'ngan' } })).status, 400);
  const ok = await api.request('PUT', '/auth/change-password', { token: f.token, body: { currentPassword: old, newPassword: 'MatKhauMoi1' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await login(f.user, old)).status, 401);
  assert.equal((await login(f.user, 'MatKhauMoi1')).status, 200);
});

test('quen mat khau: email la / co that deu tra 200; ma dung mot lan, het phien cu; ma sai -> 400', { skip }, async () => {
  const f = await createParent();
  for (const email of [f.user.email, `khongco${Date.now()}@test.vn`]) {
    const r = await api.request('POST', '/auth/forgot-password', { body: { email } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.ok(await prisma.authToken.count({ where: { userId: f.user.id, type: 'password_reset' } }), 'da tao ma cho email co that');

  await prisma.user.update({ where: { id: f.user.id }, data: { passwordHash: await (await import('bcryptjs')).default.hash('Matkhau123', 10) } });
  const session = await login(f.user, 'Matkhau123');
  assert.equal(session.status, 200, JSON.stringify(session.body));
  const raw = await tokens.generatePasswordResetToken(f.user.id); // ma moi; ma gui email truoc do het hieu luc
  assert.equal((await api.request('POST', '/auth/reset-password', { body: { token: 'sai', newPassword: 'DatLai12345' } })).status, 400);
  const ok = await api.request('POST', '/auth/reset-password', { body: { token: raw, newPassword: 'DatLai12345' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await api.request('POST', '/auth/reset-password', { body: { token: raw, newPassword: 'Khac123456' } })).status, 400, 'ma dung mot lan');
  const refresh = await api.request('POST', '/auth/refresh-tokens', { body: { refreshToken: session.body.data.tokens.refreshToken } });
  assert.equal(refresh.status, 401, 'phien cu bi thu hoi');
  assert.equal((await login(f.user, 'Matkhau123')).status, 401);
  assert.equal((await login(f.user, 'DatLai12345')).status, 200);
});
