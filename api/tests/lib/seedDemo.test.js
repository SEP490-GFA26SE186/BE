import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const { DEMO_USERS, DEMO_PASSWORD, DEMO_KID_PIN, demoGrantKey } = await import('../../prisma/seed_demo.js');

const DOC_URL = new URL('../../../../Web/docs/DEMO_ACCOUNTS.md', import.meta.url);

test('seed demo: dung 3 vai tro', () => {
  assert.deepEqual(DEMO_USERS.map((u) => u.role).sort(), ['admin', 'parent', 'specialist']);
});

// Repo Web nam canh BE (D:/sep490/Web); clone rieng BE (CI) thi bo qua thay vi fail.
test('seed demo: email / sdt / mat khau / PIN khop Web/docs/DEMO_ACCOUNTS.md', { skip: !existsSync(DOC_URL) }, () => {
  const doc = readFileSync(DOC_URL, 'utf8');
  for (const u of DEMO_USERS) {
    assert.ok(doc.includes(u.email), u.email);
    assert.ok(doc.includes(u.phone), u.phone);
  }
  assert.ok(doc.includes(`**\`${DEMO_PASSWORD}\`**`));
  assert.ok(doc.includes(`\`${DEMO_KID_PIN}\``));
});

test('seed demo: username khong trung, khoa cap credit co dinh theo user', () => {
  assert.equal(new Set(DEMO_USERS.map((u) => u.username)).size, DEMO_USERS.length);
  assert.equal(demoGrantKey('u1'), demoGrantKey('u1'));
  assert.ok(demoGrantKey('u1').length <= 120); // idempotency_key varchar(120)
});
