// M7: tests/integration/_db.js phai tro DATABASE_URL ve DB test (hoac URL gia khi khong co DB test),
// de khong gi roi vao DB dev trong .env. Chay _db.js trong tien trinh con: file do chi gan
// process.env, khong ket noi DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dbModule = pathToFileURL(fileURLToPath(new URL('./integration/_db.js', import.meta.url))).href;
const DEV = 'postgresql://dev:dev@dev.example:5432/dev';

const envAfterImport = (extra) => {
  const env = { ...process.env, DATABASE_URL: DEV, ...extra };
  if (!('TEST_DATABASE_URL' in extra)) delete env.TEST_DATABASE_URL;
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(dbModule)});
       console.log(JSON.stringify({ hasTestDb: m.hasTestDb, db: process.env.DATABASE_URL }));`,
    ],
    { env, encoding: 'utf8' },
  );
  return JSON.parse(out.trim().split('\n').pop());
};

test('co TEST_DATABASE_URL -> dung no', () => {
  const r = envAfterImport({ TEST_DATABASE_URL: 'postgresql://t/test' });
  assert.deepEqual(r, { hasTestDb: true, db: 'postgresql://t/test' });
});

test('khong co DB test -> URL gia, khong con URL cua DB dev', () => {
  const r = envAfterImport({});
  assert.equal(r.hasTestDb, false);
  assert.notEqual(r.db, DEV);
});
