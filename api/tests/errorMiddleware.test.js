import test from 'node:test';
import assert from 'node:assert/strict';
import { StatusCodes } from 'http-status-codes';

// Phai dat env TRUOC khi import config/env.js (no validate luc import).
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

const { Prisma } = await import('@prisma/client');
const { errorConverter } = await import('../src/middlewares/error.middleware.js');
const ApiError = (await import('../src/utils/ApiError.js')).default;

/** Goi errorConverter va tra ve error ma no day sang next(). */
const convert = (err) => {
  let captured;
  errorConverter(err, {}, {}, (e) => {
    captured = e;
  });
  return captured;
};

test('loi Prisma P2002 -> 409, khong con la 500', () => {
  const prismaErr = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { modelName: 'User', target: ['email'] },
  });

  const converted = convert(prismaErr);

  assert.equal(converted.statusCode, StatusCodes.CONFLICT);
  assert.match(converted.message, /email/);
});

test('vi pham CHECK khong lam ro ri du lieu dong bi tu choi ra client', () => {
  const prismaErr = new Prisma.PrismaClientUnknownRequestError(
    'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError ' +
      '{ code: "23514", message: "violates check constraint \\"wallets_non_negative_check\\"", ' +
      'detail: Some("Failing row contains (abc-123, -50, 999999, 0, 0)."), hint: None }) })',
    { clientVersion: '6.19.3' },
  );

  const converted = convert(prismaErr);

  assert.equal(converted.statusCode, StatusCodes.BAD_REQUEST);
  assert.match(converted.message, /wallets_non_negative_check/);
  assert.doesNotMatch(converted.message, /Failing row contains/);
  assert.doesNotMatch(converted.message, /999999/);
});

test('loi goc duoc giu lam cause de log server con chi tiet', () => {
  const prismaErr = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { modelName: 'User', target: ['email'] },
  });

  const converted = convert(prismaErr);

  // Client chi thay message an toan, nhung chi tiet chan doan khong bi mat.
  assert.equal(converted.cause, prismaErr);
});

test('ApiError co san di qua khong bi doi', () => {
  const original = ApiError.forbidden('Nope');

  const converted = convert(original);

  assert.equal(converted, original);
  assert.equal(converted.statusCode, StatusCodes.FORBIDDEN);
});

test('loi thuong van thanh 500 nhu truoc', () => {
  const converted = convert(new Error('boom'));

  assert.equal(converted.statusCode, StatusCodes.INTERNAL_SERVER_ERROR);
  assert.equal(converted.isOperational, false);
});
