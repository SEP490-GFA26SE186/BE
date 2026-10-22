import test from 'node:test';
import assert from 'node:assert/strict';

// Phai dat env TRUOC khi import config/env.js (no validate luc import).
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.AI_SERVICE_URL = 'http://ai:8000';
process.env.INTERNAL_TOKEN = 'test-token';
process.env.AI_TIMEOUT_MS_STORY_TEXT = '50';

const { callAi, AiServiceError, NON_RETRYABLE_ERROR_CODES } = await import(
  '../src/clients/aiClient.js'
);
const { AI_JOB } = await import('../src/queues/ai.jobs.js');

const payload = { story_id: 'test' };

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

const errorBody = (code, retryable, message = 'loi') => ({
  error: { code, message, retryable },
});

/** Stub fetch tra loi loi, goi callAi va kiem tra error. */
const expectError = async (status, body, check, jobName = AI_JOB.STORY_TEXT) => {
  const restore = stubFetch(async () => jsonResponse(status, body));
  try {
    await assert.rejects(
      () => callAi(jobName, payload),
      (error) => {
        assert.ok(error instanceof AiServiceError);
        check(error);
        return true;
      },
    );
  } finally {
    restore();
  }
};

test('AI_JOB co nam ten job khop ai_request_type', () => {
  assert.deepEqual(AI_JOB, {
    STORY_TEXT: 'story_text',
    CHARACTER_PORTRAIT: 'character_portrait',
    SCENE_IMAGE: 'scene_image',
    NARRATION: 'narration',
    STORY_ANALYSIS: 'story_analysis',
  });
});

test('NON_RETRYABLE_ERROR_CODES la bon ma cua spec AI', () => {
  assert.deepEqual(
    [...NON_RETRYABLE_ERROR_CODES].sort(),
    ['FORBIDDEN_TERM_DETECTED', 'INVALID_INPUT', 'OUTPUT_INVALID', 'SAFETY_BLOCKED'],
  );
});

test('tra ve nguyen body khi ai/ thanh cong', async () => {
  const body = { title: 'x', pages: [], usage: { input_tokens: 5 } };
  const restore = stubFetch(async () => jsonResponse(200, body));
  try {
    const result = await callAi(AI_JOB.STORY_TEXT, payload);
    assert.deepEqual(result, body);
  } finally {
    restore();
  }
});

test('story_text goi /v1/story/generate kem X-Internal-Token', async () => {
  let seenUrl;
  let seenToken;
  let seenMethod;
  const restore = stubFetch(async (url, options) => {
    seenUrl = url;
    seenMethod = options.method;
    seenToken = options.headers['X-Internal-Token'];
    return jsonResponse(200, {});
  });
  try {
    await callAi(AI_JOB.STORY_TEXT, payload);
    assert.equal(seenMethod, 'POST');
    assert.equal(seenUrl, 'http://ai:8000/v1/story/generate');
    assert.equal(seenToken, 'test-token');
  } finally {
    restore();
  }
});

test('narration goi /v1/tts/synthesize kem X-Internal-Token', async () => {
  let seenUrl;
  let seenToken;
  const restore = stubFetch(async (url, options) => {
    seenUrl = url;
    seenToken = options.headers['X-Internal-Token'];
    return jsonResponse(200, {});
  });
  try {
    await callAi(AI_JOB.NARRATION, payload);
    assert.equal(seenUrl, 'http://ai:8000/v1/tts/synthesize');
    assert.equal(seenToken, 'test-token');
  } finally {
    restore();
  }
});

test('SAFETY_BLOCKED KHONG retryable', () =>
  expectError(422, errorBody('SAFETY_BLOCKED', false, 'bi chan'), (error) => {
    assert.equal(error.code, 'SAFETY_BLOCKED');
    assert.equal(error.message, 'bi chan');
    assert.equal(error.status, 422);
    assert.equal(error.retryable, false);
  }));

test('OUTPUT_INVALID KHONG retryable', () =>
  expectError(502, errorBody('OUTPUT_INVALID', false), (error) => {
    assert.equal(error.code, 'OUTPUT_INVALID');
    assert.equal(error.retryable, false);
  }));

test('PROVIDER_ERROR voi retryable=true CO retryable', () =>
  expectError(502, errorBody('PROVIDER_ERROR', true), (error) => {
    assert.equal(error.code, 'PROVIDER_ERROR');
    assert.equal(error.retryable, true);
  }));

test('ma la nhung retryable=false -> KHONG retryable (tin service)', () =>
  expectError(500, errorBody('MA_LA_MOI', false), (error) => {
    assert.equal(error.code, 'MA_LA_MOI');
    assert.equal(error.retryable, false);
  }));

test('INVALID_INPUT voi retryable=true van KHONG retryable (tap ma cua Node thang)', () =>
  expectError(400, errorBody('INVALID_INPUT', true), (error) => {
    assert.equal(error.code, 'INVALID_INPUT');
    assert.equal(error.retryable, false);
  }));

test('HTTP 500 khong body -> PROVIDER_ERROR, retryable', async () => {
  const restore = stubFetch(async () => new Response('', { status: 500 }));
  try {
    await assert.rejects(
      () => callAi(AI_JOB.STORY_TEXT, payload),
      (error) => {
        assert.equal(error.code, 'PROVIDER_ERROR');
        assert.equal(error.status, 500);
        assert.equal(error.retryable, true);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('het gio (AI_TIMEOUT_MS_STORY_TEXT=50) -> TIMEOUT, retryable', async () => {
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
      () => callAi(AI_JOB.STORY_TEXT, payload),
      (error) => {
        assert.equal(error.code, 'TIMEOUT');
        assert.equal(error.retryable, true);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('loi mang -> PROVIDER_ERROR, retryable', async () => {
  const restore = stubFetch(async () => {
    throw new TypeError('fetch failed');
  });
  try {
    await assert.rejects(
      () => callAi(AI_JOB.STORY_TEXT, payload),
      (error) => {
        assert.equal(error.code, 'PROVIDER_ERROR');
        assert.equal(error.retryable, true);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('ten job la -> INVALID_INPUT, KHONG retryable', async () => {
  await assert.rejects(
    () => callAi('khong-ton-tai', payload),
    (error) => {
      assert.equal(error.code, 'INVALID_INPUT');
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

// M1: 2xx ma body khong doc/parse duoc la loi tam thoi (mang dut, het gio luc doc body), KHONG phai
// output sai cua model -> PROVIDER_ERROR retryable, khong de planPersist bien no thanh OUTPUT_INVALID.
const expectProviderError = async (makeResponse) => {
  const restore = stubFetch(async () => makeResponse());
  try {
    await assert.rejects(
      () => callAi(AI_JOB.STORY_TEXT, payload),
      (error) => {
        assert.ok(error instanceof AiServiceError);
        assert.equal(error.code, 'PROVIDER_ERROR');
        assert.equal(error.status, 200);
        assert.equal(error.retryable, true);
        return true;
      },
    );
  } finally {
    restore();
  }
};

test('HTTP 200 body khong phai JSON -> PROVIDER_ERROR, retryable', () =>
  expectProviderError(() => new Response('{"pages": {"p1": ', { status: 200 })));

test('HTTP 200 body rong -> PROVIDER_ERROR, retryable', () =>
  expectProviderError(() => new Response('', { status: 200 })));

test('HTTP 200 doc body bi dut giua chung (TimeoutError) -> PROVIDER_ERROR, retryable', () =>
  expectProviderError(
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"pages":'));
            controller.error(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
          },
        }),
        { status: 200 },
      ),
  ));
