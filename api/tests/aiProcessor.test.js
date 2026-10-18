import test from 'node:test';
import assert from 'node:assert/strict';

// env.js validate luc import (aiClient.js import no). Processor KHONG duoc cham Prisma o day.
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';

const { UnrecoverableError } = await import('bullmq');
const { createAiProcessor } = await import('../src/workers/ai.processor.js');
const { AiServiceError } = await import('../src/clients/aiClient.js');

const AI_REQUEST_ID = '11111111-1111-1111-1111-111111111111';

const input = () => ({
  aiRequestId: AI_REQUEST_ID,
  situation: '{NV1} giận em.',
  topic: { title: 'Cơn giận', caselCode: 'self_management', guidance: 'g' },
  characters: [{ token: '{NV1}', isMain: true, appearance: 'bé trai' }],
  pages: [{ pageOrder: 1 }, { pageOrder: 2 }],
  checkpoints: [{ type: 'reflection', afterPageOrder: 2, targetToken: null }],
  limits: { page_min_words: 1 },
  nameContext: { nameMap: [], forbiddenTerms: ['Bin'] },
  blockedKeywords: [],
});

const job = ({ name = 'story_text', attemptsMade = 0, attempts = 3 } = {}) => ({
  id: AI_REQUEST_ID,
  name,
  data: { ai_request_id: AI_REQUEST_ID },
  attemptsMade,
  opts: { attempts },
});

/** Stub moi dependency, ghi lai thu tu goi. `overrides` thay tung ham. */
function setup(overrides = {}) {
  const calls = [];
  const logs = { warn: [], error: [], info: [] };
  const record = (name, fn) => async (...args) => {
    calls.push([name, ...args]);
    return fn(...args);
  };
  const deps = {
    markProcessing: record('markProcessing', overrides.markProcessing ?? (async () => true)),
    loadInput: record('loadInput', overrides.loadInput ?? (async () => input())),
    callAi: record('callAi', overrides.callAi ?? (async () => ({ warnings: [] }))),
    persist: record('persist', overrides.persist ?? (async () => true)),
    finalize: record('finalize', overrides.finalize ?? (async () => true)),
    logger: {
      warn: (...a) => logs.warn.push(a),
      error: (...a) => logs.error.push(a),
      info: (...a) => logs.info.push(a),
    },
  };
  return { calls, logs, processor: createAiProcessor(deps), names: () => calls.map((c) => c[0]) };
}

const isUnrecoverable = (re) => (err) => {
  assert.ok(err instanceof UnrecoverableError, `can UnrecoverableError, nhan ${err?.name}`);
  if (re) assert.match(err.message, re);
  return true;
};

test('story_text thanh cong: markProcessing -> loadInput -> callAi -> persist, tra { aiRequestId, warnings }', async () => {
  const warnings = [{ code: 'PAGE_TOO_SHORT', message: 'x' }];
  const { calls, names, logs, processor } = setup({ callAi: async () => ({ warnings, pages: {} }) });

  const result = await processor(job({ attemptsMade: 1 }));

  assert.deepEqual(result, { aiRequestId: AI_REQUEST_ID, warnings });
  assert.deepEqual(names(), ['markProcessing', 'loadInput', 'callAi', 'persist']);
  assert.deepEqual(calls[0], ['markProcessing', AI_REQUEST_ID, 2]);
  assert.deepEqual(calls[1], ['loadInput', AI_REQUEST_ID]);
  // callAi nhan payload da dung tu input (snake_case, request_id = ai_request id).
  assert.equal(calls[2][1], 'story_text');
  assert.equal(calls[2][2].request_id, AI_REQUEST_ID);
  assert.deepEqual(calls[2][2].pages, ['p1', 'p2']);
  assert.deepEqual(calls[3][1], { aiRequestId: AI_REQUEST_ID, response: { warnings, pages: {} } });
  // warnings khac rong -> logger.warn kem danh sach code.
  assert.equal(logs.warn.length, 1);
  assert.match(logs.warn[0].join(' '), /PAGE_TOO_SHORT/);
});

test('warnings rong -> khong logger.warn', async () => {
  const { logs, processor } = setup();
  const result = await processor(job());
  assert.deepEqual(result, { aiRequestId: AI_REQUEST_ID, warnings: [] });
  assert.equal(logs.warn.length, 0);
});

test('markProcessing tra false -> { skipped: true }, khong goi AI', async () => {
  const { names, processor } = setup({ markProcessing: async () => false });
  const result = await processor(job());
  assert.equal(result.skipped, true);
  assert.deepEqual(names(), ['markProcessing']);
});

test('loi retryable lan 1/3 -> nem lai chinh loi do, khong finalize', async () => {
  const error = new AiServiceError('TIMEOUT', 'het gio');
  const { names, processor } = setup({
    callAi: async () => {
      throw error;
    },
  });
  await assert.rejects(processor(job({ attemptsMade: 0 })), (err) => err === error);
  assert.equal(names().includes('finalize'), false);
});

test('loi retryable lan 3/3 -> finalize failed, UnrecoverableError', async () => {
  const { calls, processor } = setup({
    callAi: async () => {
      throw new AiServiceError('TIMEOUT', 'het gio');
    },
  });
  await assert.rejects(processor(job({ attemptsMade: 2 })), isUnrecoverable(/TIMEOUT/));
  const fin = calls.find((c) => c[0] === 'finalize');
  assert.deepEqual(fin[1], { aiRequestId: AI_REQUEST_ID, status: 'failed', code: 'TIMEOUT', message: 'het gio' });
});

test('SAFETY_BLOCKED lan 1 -> finalize blocked, UnrecoverableError', async () => {
  const { calls, logs, processor } = setup({
    callAi: async () => {
      throw new AiServiceError('SAFETY_BLOCKED', 'bi chan');
    },
  });
  await assert.rejects(processor(job({ attemptsMade: 0 })), isUnrecoverable(/SAFETY_BLOCKED/));
  const fin = calls.find((c) => c[0] === 'finalize');
  assert.equal(fin[1].status, 'blocked');
  assert.equal(fin[1].code, 'SAFETY_BLOCKED');
  assert.equal(logs.error.length, 0);
});

test('FORBIDDEN_TERM_DETECTED -> logger.error (bug phia Node), finalize blocked', async () => {
  const { calls, logs, processor } = setup({
    callAi: async () => {
      throw new AiServiceError('FORBIDDEN_TERM_DETECTED', 'lot ten Bin');
    },
  });
  await assert.rejects(processor(job()), isUnrecoverable());
  assert.equal(logs.error.length, 1);
  assert.match(logs.error[0].join(' '), /FORBIDDEN_TERM_DETECTED/);
  assert.equal(calls.find((c) => c[0] === 'finalize')[1].status, 'blocked');
});

test('persist nem loi DB lan 1/3 -> nem lai de BullMQ retry, khong finalize', async () => {
  const error = new Error('connection reset');
  const { names, processor } = setup({
    persist: async () => {
      throw error;
    },
  });
  await assert.rejects(processor(job({ attemptsMade: 0 })), (err) => err === error);
  assert.equal(names().includes('finalize'), false);
});

test('persist nem loi DB lan cuoi -> finalize failed INTERNAL', async () => {
  const { calls, processor } = setup({
    persist: async () => {
      throw new Error('connection reset');
    },
  });
  await assert.rejects(processor(job({ attemptsMade: 2 })), isUnrecoverable(/INTERNAL/));
  const fin = calls.find((c) => c[0] === 'finalize');
  assert.equal(fin[1].status, 'failed');
  assert.equal(fin[1].code, 'INTERNAL');
});

test('persist tra false (da bi ket thuc noi khac) -> skipped, khong nem', async () => {
  const { processor } = setup({ persist: async () => false });
  const result = await processor(job());
  assert.equal(result.skipped, true);
});

test('job ten khac (narration) -> UnrecoverableError "chua ho tro", khong dung DB', async () => {
  const { names, processor } = setup();
  await assert.rejects(processor(job({ name: 'narration' })), isUnrecoverable(/chưa hỗ trợ/));
  assert.deepEqual(names(), []);
});

// ---------------------------------------------------------------------------
// mock_force (I2): chi script smoke/E2E dat; processor chuyen thanh `__force` ngoai production.
// ---------------------------------------------------------------------------

const withNodeEnv = async (value, fn) => {
  const prev = process.env.NODE_ENV;
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
};

const forcedJob = (mockForce) => ({ ...job(), data: { ai_request_id: AI_REQUEST_ID, mock_force: mockForce } });

test('mock_force trong job data, NODE_ENV=development -> payload co __force', async () => {
  const { calls, processor } = setup();
  await withNodeEnv('development', () => processor(forcedJob('SAFETY_BLOCKED')));
  const payload = calls.find((c) => c[0] === 'callAi')[2];
  assert.equal(payload.__force, 'SAFETY_BLOCKED');
  assert.equal(payload.request_id, AI_REQUEST_ID);
});

test('mock_force trong job data, NODE_ENV khong dat -> payload co __force', async () => {
  const { calls, processor } = setup();
  await withNodeEnv(undefined, () => processor(forcedJob('PROVIDER_ERROR')));
  assert.equal(calls.find((c) => c[0] === 'callAi')[2].__force, 'PROVIDER_ERROR');
});

test('mock_force trong job data, NODE_ENV=production -> KHONG co __force', async () => {
  const { calls, processor } = setup();
  await withNodeEnv('production', () => processor(forcedJob('SAFETY_BLOCKED')));
  assert.equal('__force' in calls.find((c) => c[0] === 'callAi')[2], false);
});

test('khong co mock_force -> KHONG co __force (ke ca ngoai production)', async () => {
  const { calls, processor } = setup();
  await withNodeEnv('development', () => processor(job()));
  assert.equal('__force' in calls.find((c) => c[0] === 'callAi')[2], false);
});
