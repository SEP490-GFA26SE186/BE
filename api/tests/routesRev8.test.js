import test from 'node:test';
import assert from 'node:assert/strict';

// Phai dat env TRUOC khi import config/env.js (no validate luc import).
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const app = (await import('../src/app.js')).default;

// Route da bo o rev8 (bang khong con trong DBML): phai 404, khong duoc "song lai" do ai do import nham.
// Route giu lai: goi khong token -> 401 (route ton tai, bi chan o auth, chua cham DB).
const REMOVED = [
  ['GET', '/api/v1/templates'],
  ['GET', '/api/v1/notifications'],
  ['GET', '/api/v1/credit-packs'],
  ['POST', '/api/v1/content-library/templates/00000000-0000-0000-0000-000000000000/stages'],
];
const KEPT = [
  ['GET', '/api/v1/content-library/stats'],
  ['GET', '/api/v1/subscriptions/me'],
  ['POST', '/api/v1/content-library/keywords/bulk'],
];

test('route rev8: da bo -> 404, giu lai -> 401 khi khong co token', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const [method, path] of REMOVED) {
    const res = await fetch(base + path, { method });
    assert.equal(res.status, 404, `${method} ${path}`);
  }
  for (const [method, path] of KEPT) {
    const res = await fetch(base + path, { method });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});
