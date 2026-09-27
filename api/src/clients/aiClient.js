// Import truc tiep env.js chu KHONG qua barrel config/index.js: barrel re-export
// ca prisma.js, nen import qua do se khoi tao PrismaClient va client HTTP nay
// khong the unit test duoc ma khong co DB.
import env from '../config/env.js';
import { AI_JOB } from '../queues/ai.jobs.js';

/**
 * Cac errorKind KHONG duoc retry. Day la NGUON SU THAT DUY NHAT cho bang loi
 * trong docs/contracts/ai-service.md — worker doc co `retryable` tu day chu
 * khong tu quyet dinh.
 *
 * - blocked_content: bo loc noi dung da chan. Retry 3 lan chi ton quota va van
 *   bi chan. App cho tre nho nen truong hop nay xay ra thuong xuyen.
 * - invalid_input:   payload sai. Retry khong the lam no dung len.
 */
export const NON_RETRYABLE_ERROR_KINDS = new Set(['blocked_content', 'invalid_input']);

/** Map ten job -> endpoint tren ai/. */
const ENDPOINT_BY_JOB = {
  [AI_JOB.STORY_PAGE]: '/v1/generate/story-page',
  [AI_JOB.NARRATION]: '/v1/generate/narration',
};

export class AiServiceError extends Error {
  constructor(errorKind, message, { status = null, detail = null } = {}) {
    super(message);
    this.name = 'AiServiceError';
    this.errorKind = errorKind;
    this.status = status;
    this.detail = detail;
    this.retryable = !NON_RETRYABLE_ERROR_KINDS.has(errorKind);
  }
}

/**
 * Goi ai/ de sinh noi dung.
 *
 * Luon throw AiServiceError khi that bai, de worker chi can doc `.retryable`.
 *
 * @param {string} jobName mot gia tri trong AI_JOB
 * @param {{ jobId: string, idempotencyKey: string, storagePrefix: string, input: object }} payload
 * @returns {Promise<object>} response body cua ai/
 */
export const callAi = async (jobName, payload) => {
  const endpoint = ENDPOINT_BY_JOB[jobName];
  if (!endpoint) {
    throw new AiServiceError('invalid_input', `Unknown AI job name: ${jobName}`);
  }
  if (!env.ai.serviceUrl || !env.ai.internalToken) {
    // Khong retryable: thieu cau hinh thi thu lai 3 lan cung vay.
    throw new AiServiceError(
      'invalid_input',
      'Missing AI_SERVICE_URL or INTERNAL_TOKEN — container nay khong duoc cau hinh de goi ai/',
    );
  }

  let response;
  try {
    response = await fetch(`${env.ai.serviceUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': env.ai.internalToken,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(env.ai.timeoutMs),
    });
  } catch (error) {
    // AbortSignal.timeout() nem TimeoutError; moi loi mang khac deu retryable.
    const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    throw new AiServiceError(
      isTimeout ? 'timeout' : 'provider_error',
      isTimeout
        ? `ai/ khong tra loi trong ${env.ai.timeoutMs}ms`
        : `Khong goi duoc ai/: ${error.message}`,
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // ai/ luon tra { status: 'failed', errorKind, message }.
    // Neu thieu errorKind (vd. crash truoc khi vao handler) thi coi la
    // provider_error -> retryable, vi day co the la loi tam thoi.
    throw new AiServiceError(
      body?.errorKind ?? 'provider_error',
      body?.message ?? `ai/ tra ve HTTP ${response.status}`,
      { status: response.status, detail: body },
    );
  }

  return body;
};

export default { callAi, AiServiceError, NON_RETRYABLE_ERROR_KINDS };
