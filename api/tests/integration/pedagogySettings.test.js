import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, startServer } from './_fixtures.js';

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

// Chi PUT lai gia tri mac dinh: DB test dung chung voi bao cao EQ cua cac file test khac chay song song.
const DEFAULTS = { window: 5, minItems: 3, developingFrom: 0.5, secureFrom: 0.8 };

test('tham so bao cao EQ: phu huynh 403; Specialist doc / sua; sai rang buoc -> 400 tieng Viet', { skip }, async () => {
  const parent = await createParent();
  assert.equal((await api.request('GET', '/pedagogy/report-settings', { token: parent.token })).status, 403);
  assert.equal((await api.request('PUT', '/pedagogy/report-settings', { token: parent.token, body: DEFAULTS })).status, 403);

  const { user, token } = await createUser({ role: 'specialist' });
  const get = await api.request('GET', '/pedagogy/report-settings', { token });
  assert.equal(get.status, 200, JSON.stringify(get.body));
  assert.deepEqual(Object.keys(get.body.data).sort(), ['developingFrom', 'minItems', 'secureFrom', 'window']);

  const bad = async (body, path, message) => {
    const r = await api.request('PUT', '/pedagogy/report-settings', { token, body: { ...DEFAULTS, ...body } });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    const err = r.body.errors.find((e) => e.path === path);
    assert.ok(err, JSON.stringify(r.body.errors));
    assert.equal(err.message, message);
  };
  await bad({ minItems: 6 }, 'minItems', 'Số câu tối thiểu không được lớn hơn số câu xét');
  await bad({ window: 21, minItems: 3 }, 'window', 'Số câu xét tối đa là 20');
  await bad({ minItems: 0 }, 'minItems', 'Số câu tối thiểu ít nhất là 1');
  await bad({ window: 4.5 }, 'window', 'số câu xét (window) phải là số nguyên');
  await bad({ developingFrom: 0 }, 'developingFrom', 'Ngưỡng "Đang phát triển" phải lớn hơn 0');
  await bad({ developingFrom: 0.8, secureFrom: 0.8 }, 'secureFrom', 'Ngưỡng "Vững" phải lớn hơn ngưỡng "Đang phát triển"');
  await bad({ secureFrom: 1.5 }, 'secureFrom', 'Ngưỡng "Vững" tối đa là 1');

  const put = await api.request('PUT', '/pedagogy/report-settings', { token, body: DEFAULTS });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.deepEqual(put.body.data, DEFAULTS);
  const row = await prisma.platformSetting.findUnique({ where: { key: 'eq_report.min_items' } });
  assert.deepEqual({ value: row.value, updatedBy: row.updatedBy }, { value: 3, updatedBy: user.id });

  const admin = await createUser({ role: 'admin' });
  assert.equal((await api.request('GET', '/pedagogy/report-settings', { token: admin.token })).status, 200);
});
