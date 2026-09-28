import test from 'node:test';
import assert from 'node:assert/strict';
import { StatusCodes } from 'http-status-codes';
import { Prisma } from '@prisma/client';

import toApiError from '../src/utils/prismaError.js';

const CLIENT_VERSION = '6.19.3';

const known = (code, meta, message = 'x') =>
  new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: CLIENT_VERSION, meta });

const unknown = (message) =>
  new Prisma.PrismaClientUnknownRequestError(message, { clientVersion: CLIENT_VERSION });

// Nguyen van message Prisma tra ve cho vi pham CHECK — bat duoc tu Postgres 16.
// Chu y `detail` chua CA DONG du lieu; day la thu tuyet doi khong duoc ra client.
const CHECK_VIOLATION_MESSAGE = `
Invalid \`prisma.topic.create()\` invocation:


Error occurred during query execution:
ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23514", message: "new row for relation \\"topics\\" violates check constraint \\"topics_age_range_check\\"", severity: "ERROR", detail: Some("Failing row contains (7a5a290b-6012-44bb-84c8-c56b9c6257e4, T3, a6810e53-5b1d-48b6-8e53-7cb4394f89e7, g, 9, 5, 0, t, 0cd08f2e-861d-4599-9f7f-209499d7e1ab, 2026-09-28 13:25:48.402+00, 2026-09-28 13:25:48.402+00)."), column: None, hint: None }), transient: false })`;

// Trigger append-only cua wallet_ledger raise exception -> SQLSTATE P0001.
const TRIGGER_MESSAGE = `
Invalid \`prisma.walletLedger.updateMany()\` invocation:


Error occurred during query execution:
ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "P0001", message: "wallet_ledger la append-only: khong duoc update  (so cai chi ghi them, moi thay doi so du la mot dong moi)", severity: "ERROR", detail: None, column: None, hint: None }), transient: false })`;

// ---------------------------------------------------------------------------
// Loi Prisma co ma (co e.code)
// ---------------------------------------------------------------------------

test('P2002 unique -> 409 va neu ten field', () => {
  const err = toApiError(known('P2002', { modelName: 'User', target: ['email'] }));

  assert.equal(err.statusCode, StatusCodes.CONFLICT);
  assert.match(err.message, /email/);
});

test('P2002 tu partial unique index viet tay -> 409 va neu ten cot', () => {
  // Prisma khong biet partial unique ton tai, nhung van doc duoc ten cot tu Postgres.
  const err = toApiError(known('P2002', { modelName: 'AuthToken', target: ['child_id'] }));

  assert.equal(err.statusCode, StatusCodes.CONFLICT);
  assert.match(err.message, /child_id/);
});

test('P2002 khong co meta.target van tra 409', () => {
  const err = toApiError(known('P2002', undefined));

  assert.equal(err.statusCode, StatusCodes.CONFLICT);
});

test('P2003 foreign key -> 409', () => {
  const err = toApiError(known('P2003', { modelName: 'Story', constraint: 'stories_topic_id_fkey' }));

  assert.equal(err.statusCode, StatusCodes.CONFLICT);
});

test('P2025 khong tim thay ban ghi -> 404', () => {
  const err = toApiError(known('P2025', { modelName: 'User', cause: 'No record was found for an update.' }));

  assert.equal(err.statusCode, StatusCodes.NOT_FOUND);
});

test('P2000 gia tri qua dai -> 400', () => {
  const err = toApiError(known('P2000', { modelName: 'User', column_name: '(not available)' }));

  assert.equal(err.statusCode, StatusCodes.BAD_REQUEST);
});

test('P2034 xung dot transaction -> 409', () => {
  const err = toApiError(known('P2034', undefined));

  assert.equal(err.statusCode, StatusCodes.CONFLICT);
});

// ---------------------------------------------------------------------------
// Loi khong co ma — CHECK va trigger. Phai doc SQLSTATE tu message.
// ---------------------------------------------------------------------------

test('CHECK (23514) -> 400 va neu ten constraint', () => {
  const err = toApiError(unknown(CHECK_VIOLATION_MESSAGE));

  assert.equal(err.statusCode, StatusCodes.BAD_REQUEST);
  assert.match(err.message, /topics_age_range_check/);
});

test('CHECK KHONG duoc lam ro ri du lieu cua dong bi tu choi', () => {
  const err = toApiError(unknown(CHECK_VIOLATION_MESSAGE));

  assert.doesNotMatch(err.message, /Failing row contains/);
  assert.doesNotMatch(err.message, /7a5a290b/);
  assert.doesNotMatch(err.message, /ConnectorError/);
});

test('trigger append-only (P0001) -> 409', () => {
  const err = toApiError(unknown(TRIGGER_MESSAGE));

  assert.equal(err.statusCode, StatusCodes.CONFLICT);
});

// ---------------------------------------------------------------------------
// Nhung thu KHONG duoc map
// ---------------------------------------------------------------------------

test('loi thuong khong phai cua Prisma -> null de middleware tu xu', () => {
  assert.equal(toApiError(new Error('boom')), null);
});

test('loi he thong co .code kieu Node (ENOENT) -> null', () => {
  const e = new Error('no such file');
  e.code = 'ENOENT';

  assert.equal(toApiError(e), null);
});

test('ma Prisma chua duoc map -> null, khong doan bua', () => {
  assert.equal(toApiError(known('P2011', { constraint: 'x' })), null);
});

test('loi khong ro nhung khong chua SQLSTATE nao -> null', () => {
  assert.equal(toApiError(unknown('Error occurred during query execution: something else')), null);
});
