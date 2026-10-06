// M7: tests/integration/_db.js phai tro CA DATABASE_URL lan DIRECT_URL ve DB test (hoac gia khi khong
// co DB test), de khong gi roi vao DB Supabase dung chung. Chay _db.js trong tien trinh con: file do
// chi gan process.env, khong ket noi DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dbModule = pathToFileURL(fileURLToPath(new URL('./integration/_db.js', import.meta.url))).href;
const SHARED = 'postgresql://shared:shared@shared.example:5432/shared';

const envAfterImport = (extra) => {
  const env = { ...process.env, DATABASE_URL: SHARED, DIRECT_URL: SHARED, ...extra };
  for (const k of ['TEST_DATABASE_URL', 'TEST_DIRECT_URL']) if (!(k in extra)) delete env[k];
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(dbModule)});
       console.log(JSON.stringify({ hasTestDb: m.hasTestDb, db: process.env.DATABASE_URL, direct: process.env.DIRECT_URL }));`,
    ],
    { env, encoding: 'utf8' },
  );
  return JSON.parse(out.trim().split('\n').pop());
};

test('co TEST_DATABASE_URL + TEST_DIRECT_URL -> dung ca hai', () => {
  const r = envAfterImport({ TEST_DATABASE_URL: 'postgresql://t/pool', TEST_DIRECT_URL: 'postgresql://t/direct' });
  assert.deepEqual(r, { hasTestDb: true, db: 'postgresql://t/pool', direct: 'postgresql://t/direct' });
});

test('co TEST_DATABASE_URL, thieu TEST_DIRECT_URL -> DIRECT_URL = TEST_DATABASE_URL', () => {
  const r = envAfterImport({ TEST_DATABASE_URL: 'postgresql://t/pool' });
  assert.deepEqual(r, { hasTestDb: true, db: 'postgresql://t/pool', direct: 'postgresql://t/pool' });
});

test('khong co DB test -> ca hai la URL gia, khong con URL dung chung', () => {
  const r = envAfterImport({});
  assert.equal(r.hasTestDb, false);
  assert.notEqual(r.db, SHARED);
  assert.notEqual(r.direct, SHARED);
  assert.equal(r.direct, r.db);
});
