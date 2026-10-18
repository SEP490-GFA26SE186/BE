// Ham thuan cho trang thai sinh chu (spec §4.3, §8.4, §8.5).

/** Job `queued`/`processing` qua 10 phut coi la ket (> te nhat 3 x 120s + backoff). */
export const STALE_AFTER_MS = 600000;

/** `ai_requests.error_message` cat toi da bay nhieu ky tu. */
export const ERROR_MESSAGE_MAX = 1000;

const ACTIVE = new Set(['queued', 'processing']);

export const isActiveStatus = (status) => ACTIVE.has(status);

/** `ai_request` dang chay ma tao qua STALE_AFTER_MS truoc `now`. */
export function isStaleRequest({ status, createdAt }, now) {
  return ACTIVE.has(status) && now.getTime() - new Date(createdAt).getTime() > STALE_AFTER_MS;
}

/** "<CODE>: <message>", cat ERROR_MESSAGE_MAX ky tu. Message rong -> chi "<CODE>". */
export function formatErrorMessage(code, message) {
  const text = message ? `${code}: ${message}` : String(code);
  return text.slice(0, ERROR_MESSAGE_MAX);
}

const CODED = /^([A-Z][A-Z0-9_]*)(?:: ([\s\S]*))?$/;

/** Nghich dao cua formatErrorMessage. Chuoi khong theo dang -> errorCode null, giu nguyen message. */
export function parseErrorMessage(errorMessage) {
  if (errorMessage == null) return { errorCode: null, errorMessage: null };
  const m = CODED.exec(errorMessage);
  if (!m) return { errorCode: null, errorMessage };
  return { errorCode: m[1], errorMessage: m[2] || null };
}

/**
 * `promise` nhung reject sau `ms` neu chua xong. Khong huy duoc `promise` goc — no van co the xong
 * muon; nguoi goi phai chiu duoc dieu do. Timer duoc don khi `promise` xong truoc.
 */
export function withTimeout(promise, ms, message = `Quá ${ms}ms`) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}
