// Import truc tiep env.js chu KHONG qua barrel config/index.js: barrel re-export
// ca prisma.js, nen import qua do se khoi tao PrismaClient va client HTTP nay
// khong the unit test duoc ma khong co DB.
import env from '../config/env.js';
import { AI_JOB } from '../queues/ai.jobs.js';

/**
 * Cac ma loi KHONG duoc retry. Phai KHOP voi NON_RETRYABLE trong spec AI
 * (§4.3) — bang loi duoc thuc thi bang code o hai noi.
 *
 * - INVALID_INPUT:          payload sai. Retry khong the lam no dung len.
 * - FORBIDDEN_TERM_DETECTED, SAFETY_BLOCKED: bo loc noi dung da chan. Retry 3
 *   lan chi ton quota va van bi chan. App cho tre nho nen truong hop nay xay
 *   ra thuong xuyen.
 * - OUTPUT_INVALID:         model tra sai dinh dang sau khi ai/ da tu thu lai.
 */
export const NON_RETRYABLE_ERROR_CODES = new Set([
  'INVALID_INPUT',
  'FORBIDDEN_TERM_DETECTED',
  'SAFETY_BLOCKED',
  'OUTPUT_INVALID',
]);

/** Endpoint + timeout mac dinh theo job (ms). env co the ghi de timeout. */
const JOB_CONFIG = {
  // > 2 x LLM_TIMEOUT_SECONDS (150 s, ai/app/config.py) + overhead: ai/ may retry once inside.
  [AI_JOB.STORY_TEXT]: { endpoint: '/v1/story/generate', timeoutMs: 320_000 },
  [AI_JOB.CHARACTER_PORTRAIT]: { endpoint: '/v1/images/portrait', timeoutMs: 90_000 },
  [AI_JOB.SCENE_IMAGE]: { endpoint: '/v1/images/scene', timeoutMs: 90_000 },
  // > TTS_TIMEOUT_SECONDS (120 s, ai/app/config.py) + overhead. Trang 51 tieng: 17 s chay thang
  // tren 5500U, 31-38 s trong Docker Desktop (2026-10-18). Queue narration chay 1 job mot luc nen
  // khong phai cho khoa ben ai/.
  [AI_JOB.NARRATION]: { endpoint: '/v1/tts/synthesize', timeoutMs: 150_000 },
};

export class AiServiceError extends Error {
  /**
   * @param {string} code    ma loi (INVALID_INPUT, TIMEOUT, PROVIDER_ERROR, ...)
   * @param {string} message
   * @param {object} [options]
   * @param {number|null} [options.status]
   * @param {*} [options.detail]
   * @param {boolean} [options.serviceRetryable] co `retryable` service tra ve
   */
  constructor(code, message, { status = null, detail = null, serviceRetryable = true } = {}) {
    super(message);
    this.name = 'AiServiceError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    // Tin service khi no noi khong retry; tap ma cua Node luon thang khi no noi retry.
    this.retryable = serviceRetryable !== false && !NON_RETRYABLE_ERROR_CODES.has(code);
  }
}

/**
 * Goi ai/ de sinh noi dung.
 *
 * Luon throw AiServiceError khi that bai, de worker chi can doc `.retryable`.
 *
 * @param {string} jobName mot gia tri trong AI_JOB
 * @param {object} payload body JSON gui ai/ (snake_case theo contract)
 * @returns {Promise<object>} response body cua ai/
 */
export const callAi = async (jobName, payload) => {
  const config = JOB_CONFIG[jobName];
  if (!config) {
    throw new AiServiceError('INVALID_INPUT', `Unknown AI job name: ${jobName}`);
  }
  if (!env.ai.serviceUrl || !env.ai.internalToken) {
    // Khong retryable: thieu cau hinh thi thu lai 3 lan cung vay.
    throw new AiServiceError(
      'INVALID_INPUT',
      'Missing AI_SERVICE_URL or INTERNAL_TOKEN — container nay khong duoc cau hinh de goi ai/',
    );
  }
  const timeoutMs = env.ai.timeoutMsByJob[jobName] ?? config.timeoutMs;

  let response;
  try {
    response = await fetch(`${env.ai.serviceUrl}${config.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': env.ai.internalToken,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // AbortSignal.timeout() nem TimeoutError; moi loi mang khac deu retryable.
    const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    throw new AiServiceError(
      isTimeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
      isTimeout
        ? `ai/ khong tra loi trong ${timeoutMs}ms`
        : `Khong goi duoc ai/: ${error.message}`,
    );
  }

  // Doc body cung co the that bai (mang dut, AbortSignal.timeout het gio giua luc doc) -> null.
  let bodyError = null;
  const body = await response.json().catch((error) => {
    bodyError = error;
    return null;
  });

  if (!response.ok) {
    // ai/ tra { error: { code, message, retryable } }. Thieu than loi (vd.
    // crash truoc khi vao handler) thi coi la PROVIDER_ERROR -> retryable, vi
    // day co the la loi tam thoi.
    const err = body?.error;
    throw new AiServiceError(
      err?.code ?? 'PROVIDER_ERROR',
      err?.message ?? `ai/ tra ve HTTP ${response.status}`,
      { status: response.status, detail: body, serviceRetryable: err?.retryable },
    );
  }

  if (body == null) {
    // 2xx ma khong doc/parse duoc body la loi tam thoi, khong phai model tra sai -> retryable.
    // De `null` di tiep thi planPersist nem OUTPUT_INVALID (khong retry) va ket thuc request.
    const reason = bodyError ? `: ${bodyError.name ?? 'Error'} ${bodyError.message ?? ''}`.trimEnd() : '';
    throw new AiServiceError('PROVIDER_ERROR', `ai/ tra HTTP ${response.status} nhung body rong/khong doc duoc${reason}`, {
      status: response.status,
    });
  }

  return body;
};

export default { callAi, AiServiceError, NON_RETRYABLE_ERROR_CODES };
