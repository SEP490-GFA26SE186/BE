// Phan loai loi cho worker (spec §8.2, §8.4). Ham thuan.
import { AiServiceError } from '../../../clients/aiClient.js';

const BLOCKED_CODES = new Set(['SAFETY_BLOCKED', 'FORBIDDEN_TERM_DETECTED']);

/** attemptsMade = so lan chay TRUOC (0 o lan dau, theo BullMQ). */
export const classifyFailure = (error, { attemptsMade, maxAttempts }) => {
  const isAi = error instanceof AiServiceError;
  const code = isAi ? error.code : 'INTERNAL';
  const retryable = isAi ? error.retryable : true;
  const isLastAttempt = attemptsMade + 1 >= maxAttempts;

  if (retryable && !isLastAttempt) return { action: 'retry' };
  return {
    action: 'finalize',
    status: BLOCKED_CODES.has(code) ? 'blocked' : 'failed',
    code,
    message: error?.message ?? String(error),
  };
};
