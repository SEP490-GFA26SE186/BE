import test from 'node:test';
import assert from 'node:assert/strict';

// Phai dat env TRUOC khi import config/env.js (no validate luc import).
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.AI_SERVICE_URL = 'http://ai:8000';
process.env.INTERNAL_TOKEN = 'test-token';
process.env.AI_TIMEOUT_MS = '50';

const { callAi } = await import('../src/clients/aiClient.js');
const { AI_JOB } = await import('../src/queues/ai.jobs.js');

const payload = {
  jobId: 'ai:story-page:1',
  idempotencyKey: 'sp_test_1',
  storagePrefix: 'stories/test/pages/1',
  input: {},
};

/** Thay global fetch bang mot response co san, tra ve ham restore. */
const stubFetch = (impl) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = original;
  };
};

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('tra ve body khi ai/ thanh cong', async () => {
  const restore = stubFetch(async () =>
    jsonResponse(200, { status: 'succeeded', latencyMs: 12, usage: { inputTokens: 5 } }),
  );
  try {
    const result = await callAi(AI_JOB.STORY_PAGE, payload);
    assert.equal(result.status, 'succeeded');
  } finally {
    restore();
  }
});

test('gui X-Internal-Token va goi dung endpoint theo ten job', async () => {
  let seenUrl;
  let seenToken;
  const restore = stubFetch(async (url, options) => {
    seenUrl = url;
    seenToken = options.headers['X-Internal-Token'];
    return jsonResponse(200, { status: 'succeeded' });
  });
  try {
    await callAi(AI_JOB.NARRATION, payload);
    assert.equal(seenUrl, 'http://ai:8000/v1/generate/narration');
    assert.equal(seenToken, 'test-token');
  } finally {
    restore();
  }
});

test('blocked_content KHONG retryable', async () => {
  const restore = stubFetch(async () =>
    jsonResponse(422, { status: 'failed', errorKind: 'blocked_content', message: 'bi chan' }),
  );
  try {
    await assert.rejects(
      () => callAi(AI_JOB.STORY_PAGE, payload),
      (error) => {
        assert.equal(error.errorKind, 'blocked_content');
        assert.equal(error.retryable, false);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('invalid_input KHONG retryable', async () => {
  const restore = stubFetch(async () =>
    jsonResponse(400, { status: 'failed', errorKind: 'invalid_input', message: 'sai payload' }),
  );
  try {
    await assert.rejects(
      () => callAi(AI_JOB.STORY_PAGE, payload),
      (error) => error.retryable === false,
    );
  } finally {
    restore();
  }
});

test('provider_throttled CO retryable', async () => {
  const restore = stubFetch(async () =>
    jsonResponse(429, { status: 'failed', errorKind: 'provider_throttled', message: 'qua tai' }),
  );
  try {
    await assert.rejects(
      () => callAi(AI_JOB.STORY_PAGE, payload),
      (error) => {
        assert.equal(error.errorKind, 'provider_throttled');
        assert.equal(error.retryable, true);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('loi HTTP khong co errorKind -> provider_error, van retryable', async () => {
  const restore = stubFetch(async () => jsonResponse(500, {}));
  try {
    await assert.rejects(
      () => callAi(AI_JOB.STORY_PAGE, payload),
      (error) => {
        assert.equal(error.errorKind, 'provider_error');
        assert.equal(error.retryable, true);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('ai/ khong tra loi kip -> timeout, van retryable', async () => {
  const restore = stubFetch(
    (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })),
        );
      }),
  );
  try {
    await assert.rejects(
      () => callAi(AI_JOB.STORY_PAGE, payload),
      (error) => {
        assert.equal(error.errorKind, 'timeout');
        assert.equal(error.retryable, true);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('ten job la khong xac dinh -> invalid_input, KHONG retryable', async () => {
  await assert.rejects(
    () => callAi('khong-ton-tai', payload),
    (error) => {
      assert.equal(error.errorKind, 'invalid_input');
      assert.equal(error.retryable, false);
      return true;
    },
  );
});
