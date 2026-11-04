// Import file nay DAU TIEN trong moi file integration (truoc bat ky thu gi dung src/config).
//
// - Co TEST_DATABASE_URL: dung no lam DATABASE_URL -> test chay that.
// - Khong co: dat DATABASE_URL gia de src/config/env.js import duoc (no bat buoc bien nay) va
//   `hasTestDb = false`; moi test() integration truyen `{ skip: !hasTestDb }`.
//
// KHONG BAO GIO de integration test roi vao DB trong .env: do la DB dev dang dung, va `wallet_ledger`
// khong xoa duoc. dotenv khong ghi de bien da co san, nen gan DATABASE_URL o day (truoc khi env.js
// chay dotenv.config()) la du de chan.
//
// Chuan bi DB test (mot database RIENG, vd `storyweaver_test` trong container postgres; lam mot lan va
// sau moi migration moi). Lenh prisma doc `.env` qua prisma.config.ts, nen phai ghi de DATABASE_URL.
// Tu BE/api (bash):
//
//   DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
//   DATABASE_URL="$TEST_DATABASE_URL" npm run db:seed
//
// PowerShell: `$env:DATABASE_URL=$env:TEST_DATABASE_URL` roi chay hai lenh tren trong CUNG phien. Seed can co topic dang hoat dong va `platform_settings` voi
// `ai_cost.story_text.<length> > 0` (test generation kiem trong `before`). Sau do chay test:
//
//   TEST_DATABASE_URL=... npm test

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

const NO_TEST_DB = 'postgresql://no-test-db:no-test-db@127.0.0.1:1/no_test_db';

process.env.DATABASE_URL = hasTestDb ? process.env.TEST_DATABASE_URL : NO_TEST_DB;

process.env.NODE_ENV = 'test';
// Token trong test ky bang chinh env.jwt.secret, nen gia tri cu the khong quan trong.
process.env.JWT_SECRET ||= 'integration-test-secret';
