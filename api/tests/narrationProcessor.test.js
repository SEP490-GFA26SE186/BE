import test from 'node:test';
import assert from 'node:assert/strict';

// env.js validate luc import (aiClient.js import no). Processor KHONG duoc cham Prisma o day.
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';

const { UnrecoverableError } = await import('bullmq');
const { createNarrationProcessor } = await import('../src/workers/narration.processor.js');
const { AiServiceError } = await import('../src/clients/aiClient.js');

const CLIP = 'cccccccc-0000-4000-8000-000000000001';
const STORY = 'ssssssss-0000-4000-8000-000000000001';

const input = (over = {}) => ({
  clip: { id: CLIP, round: 2, fingerprint: 'f'.repeat(64) },
  storyId: STORY,
  kind: 'question',
  targetId: 'k1',
  text: 'Bin đang cảm thấy thế nào?',
  voice: 'Kim Thanh',
  ...over,
});

const job = ({ attemptsMade = 0, attempts = 3, round = 2 } = {}) => ({
  id: `narration_${CLIP}_${round}`,
  name: 'narration',
  data: { clip_id: CLIP, round },
  attemptsMade,
  opts: { attempts },
});

function setup(overrides = {}) {
  const calls = [];
  const record = (name, fn) => async (...args) => {
    calls.push([name, ...args]);
    return fn(...args);
  };
  const deps = {
    markGenerating: record('markGenerating', overrides.markGenerating ?? (async () => true)),
    loadInput: record('loadInput', overrides.loadInput ?? (async () => input())),
    callAi: record('callAi', overrides.callAi ?? (async () => ({ audio_key: 'stories/s/audio/x-1.mp3', duration_seconds: 2.4 }))),
    persist: record('persist', overrides.persist ?? (async () => true)),
    fail: record('fail', overrides.fail ?? (async () => {})),
    logger: { error: () => {}, info: () => {}, warn: () => {} },
  };
  return { calls, processor: createNarrationProcessor(deps), names: () => calls.map((c) => c[0]) };
}

test('thanh cong: goi ai/ dung payload, ghi dung cot, KHONG co buoc credit nao', async () => {
  const { calls, processor, names } = setup();
  const result = await processor(job());
  assert.deepEqual(names(), ['markGenerating', 'loadInput', 'callAi', 'persist']);
  assert.deepEqual(calls[0][1], { clipId: CLIP, round: 2, attempt: 1 });
  const [, jobName, payload] = calls[2];
  assert.equal(jobName, 'narration');
  assert.deepEqual(payload, {
    request_id: `${CLIP}-r2`,
    storage_prefix: `stories/${STORY}/audio`,
    text: 'Bin đang cảm thấy thế nào?',
    voice_id: 'Kim Thanh', // luon gui tuong minh (spec §5.2)
  });
  assert.match(payload.request_id, /^[A-Za-z0-9_\-.]{1,100}$/); // luat FileSafeId cua ai/
  assert.deepEqual(calls[3][1], {
    clipId: CLIP, round: 2, fingerprint: 'f'.repeat(64), kind: 'question', targetId: 'k1',
    audioKey: 'stories/s/audio/x-1.mp3', durationSeconds: 2.4,
  });
  assert.equal(result.audioKey, 'stories/s/audio/x-1.mp3');
});

test('clip da sang luot khac -> bo qua, khong goi ai/', async () => {
  const { processor, names } = setup({ markGenerating: async () => false });
  assert.deepEqual(await processor(job()), { clipId: CLIP, skipped: true });
  assert.deepEqual(names(), ['markGenerating']);
});

test('chu da doi sau khi dua di doc -> khong doc ban cu, danh dau STALE', async () => {
  for (const loaded of [null, input({ clip: { id: CLIP, round: 3, fingerprint: 'g'.repeat(64) } })]) {
    const { calls, processor, names } = setup({ loadInput: async () => loaded });
    await processor(job());
    assert.deepEqual(names(), ['markGenerating', 'loadInput', 'fail']);
    assert.equal(calls[2][1].code, 'STALE');
  }
});

test('loi tam thoi con luot -> nem lai cho BullMQ retry, chua danh dau failed', async () => {
  const err = new AiServiceError('PROVIDER_ERROR', 'onnx', { status: 502 });
  const { processor, names } = setup({ callAi: async () => { throw err; } });
  await assert.rejects(processor(job({ attemptsMade: 0 })), (e) => e === err);
  assert.ok(!names().includes('fail'));
});

test('lan cuoi / loi khong thu lai duoc -> failed + UnrecoverableError', async () => {
  const cases = [
    [new AiServiceError('TIMEOUT', 'cham', { status: 504 }), 2, 'TIMEOUT'],
    [new AiServiceError('INVALID_INPUT', 'giong la', { status: 422, serviceRetryable: false }), 0, 'INVALID_INPUT'],
  ];
  for (const [err, attemptsMade, code] of cases) {
    const { calls, processor } = setup({ callAi: async () => { throw err; } });
    await assert.rejects(processor(job({ attemptsMade })), (e) => e instanceof UnrecoverableError && e.message.includes(code));
    const failCall = calls.find((c) => c[0] === 'fail');
    assert.deepEqual({ ...failCall[1], message: undefined }, { clipId: CLIP, round: 2, code, message: undefined });
  }
});

test('job thieu clip_id / round -> UnrecoverableError ngay', async () => {
  const { processor, names } = setup();
  await assert.rejects(processor({ ...job(), data: {} }), (e) => e instanceof UnrecoverableError);
  assert.deepEqual(names(), []);
});
