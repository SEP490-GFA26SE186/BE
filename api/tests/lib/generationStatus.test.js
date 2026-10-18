import test from 'node:test';
import assert from 'node:assert/strict';

const { STALE_AFTER_MS, isStaleRequest, formatErrorMessage, parseErrorMessage, ERROR_MESSAGE_MAX } =
  await import('../../src/modules/stories/lib/generationStatus.js');

const now = new Date('2026-09-30T12:00:00Z');
const ago = (ms) => new Date(now.getTime() - ms);

test('STALE_AFTER_MS = 10 phut', () => {
  assert.equal(STALE_AFTER_MS, 600000);
});

test('isStaleRequest: processing tao 11 phut truoc -> true; 9 phut -> false', () => {
  assert.equal(isStaleRequest({ status: 'processing', createdAt: ago(11 * 60000) }, now), true);
  assert.equal(isStaleRequest({ status: 'processing', createdAt: ago(9 * 60000) }, now), false);
});

test('isStaleRequest: queued qua han -> true; dung 10 phut -> false', () => {
  assert.equal(isStaleRequest({ status: 'queued', createdAt: ago(STALE_AFTER_MS + 1) }, now), true);
  assert.equal(isStaleRequest({ status: 'queued', createdAt: ago(STALE_AFTER_MS) }, now), false);
});

test('isStaleRequest: trang thai ket thuc khong bao gio ket', () => {
  for (const status of ['succeeded', 'failed', 'blocked']) {
    assert.equal(isStaleRequest({ status, createdAt: ago(3600000) }, now), false);
  }
});

test('formatErrorMessage: "<CODE>: <message>"', () => {
  assert.equal(formatErrorMessage('ENQUEUE_FAILED', 'Redis sập'), 'ENQUEUE_FAILED: Redis sập');
});

test('formatErrorMessage: cat con toi da 1000 ky tu', () => {
  const out = formatErrorMessage('TIMEOUT', 'x'.repeat(5000));
  assert.equal(ERROR_MESSAGE_MAX, 1000);
  assert.equal(out.length, 1000);
  assert.ok(out.startsWith('TIMEOUT: x'));
});

test('formatErrorMessage: message rong/undefined van co code', () => {
  assert.equal(formatErrorMessage('STALE_JOB', undefined), 'STALE_JOB');
  assert.equal(formatErrorMessage('STALE_JOB', ''), 'STALE_JOB');
});

test('parseErrorMessage: tach code va message', () => {
  assert.deepEqual(parseErrorMessage('SAFETY_BLOCKED: nội dung: không phù hợp'), {
    errorCode: 'SAFETY_BLOCKED',
    errorMessage: 'nội dung: không phù hợp',
  });
});

test('parseErrorMessage: chi co code', () => {
  assert.deepEqual(parseErrorMessage('STALE_JOB'), { errorCode: 'STALE_JOB', errorMessage: null });
});

test('parseErrorMessage: null -> ca hai null; chuoi khong theo dang -> khong code', () => {
  assert.deepEqual(parseErrorMessage(null), { errorCode: null, errorMessage: null });
  assert.deepEqual(parseErrorMessage('lỗi lạ'), { errorCode: null, errorMessage: 'lỗi lạ' });
});

test('parseErrorMessage la nghich dao cua formatErrorMessage', () => {
  const s = formatErrorMessage('PAGE_IDS_MISMATCH', 'thiếu p3');
  assert.deepEqual(parseErrorMessage(s), { errorCode: 'PAGE_IDS_MISMATCH', errorMessage: 'thiếu p3' });
});

const { withTimeout } = await import('../../src/modules/stories/lib/generationStatus.js');

test('withTimeout: promise khong bao gio xong -> reject sau timeout', async () => {
  const started = Date.now();
  await assert.rejects(withTimeout(new Promise(() => {}), 30, 'enqueue quá hạn'), /enqueue quá hạn/);
  assert.ok(Date.now() - started >= 25);
});

test('withTimeout: promise nhanh -> resolve gia tri cua no', async () => {
  assert.equal(await withTimeout(Promise.resolve('ok'), 1000), 'ok');
});

test('withTimeout: promise reject truoc timeout -> giu loi goc', async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error('Redis sập')), 1000), /Redis sập/);
});
