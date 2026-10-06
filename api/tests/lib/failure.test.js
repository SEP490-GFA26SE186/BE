import test from 'node:test';
import assert from 'node:assert/strict';

const { classifyFailure } = await import('../../src/modules/stories/lib/failure.js');
const { AiServiceError } = await import('../../src/clients/aiClient.js');

test('retryable, lan 1/3 -> retry', () => {
  const e = new AiServiceError('TIMEOUT', 'x');
  assert.deepEqual(classifyFailure(e, { attemptsMade: 0, maxAttempts: 3 }), { action: 'retry' });
  assert.deepEqual(classifyFailure(e, { attemptsMade: 1, maxAttempts: 3 }), { action: 'retry' });
});

test('retryable, lan 3/3 -> finalize failed', () => {
  const e = new AiServiceError('TIMEOUT', 'het gio');
  assert.deepEqual(classifyFailure(e, { attemptsMade: 2, maxAttempts: 3 }), {
    action: 'finalize',
    status: 'failed',
    code: 'TIMEOUT',
    message: 'het gio',
  });
});

test('SAFETY_BLOCKED lan 1 -> finalize blocked', () => {
  const r = classifyFailure(new AiServiceError('SAFETY_BLOCKED', 'b'), { attemptsMade: 0, maxAttempts: 3 });
  assert.equal(r.action, 'finalize');
  assert.equal(r.status, 'blocked');
  assert.equal(r.code, 'SAFETY_BLOCKED');
});

test('FORBIDDEN_TERM_DETECTED -> blocked', () => {
  const r = classifyFailure(new AiServiceError('FORBIDDEN_TERM_DETECTED', 'b'), { attemptsMade: 0, maxAttempts: 3 });
  assert.equal(r.status, 'blocked');
});

test('OUTPUT_INVALID -> failed ngay', () => {
  const r = classifyFailure(new AiServiceError('OUTPUT_INVALID', 'b'), { attemptsMade: 0, maxAttempts: 3 });
  assert.deepEqual([r.action, r.status], ['finalize', 'failed']);
});

test('loi thuong (Prisma) -> INTERNAL, retryable', () => {
  const e = new Error('connection reset');
  assert.deepEqual(classifyFailure(e, { attemptsMade: 0, maxAttempts: 3 }), { action: 'retry' });
  const last = classifyFailure(e, { attemptsMade: 2, maxAttempts: 3 });
  assert.deepEqual([last.status, last.code], ['failed', 'INTERNAL']);
});

test('service noi khong retry -> finalize failed', () => {
  const e = new AiServiceError('PROVIDER_ERROR', 'x', { serviceRetryable: false });
  assert.equal(classifyFailure(e, { attemptsMade: 0, maxAttempts: 3 }).action, 'finalize');
});
