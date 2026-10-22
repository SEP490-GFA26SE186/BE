// `analysisToken` (spec family-story §5.4): ket qua phan tich loi ke duoc ky HMAC de POST /stories
// khong phai tin momentSummary / seedEvent / nguon ky nang do client gui. Ham thuan (secret truyen vao).
// Dang token: base64url(JSON payload) + '.' + base64url(HMAC-SHA256). Payload chi chua chu da token
// hoa {NVx} (khong ten that) va hash cua loi ke.
import crypto from 'node:crypto';

export const ANALYSIS_TTL_MS = 2 * 3600 * 1000;
const VERSION = 1;

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const keyOf = (secret) => `${secret}:story-analysis`;
const mac = (secret, data) => crypto.createHmac('sha256', keyOf(secret)).update(data).digest();

/** sha256 cua loi ke da token hoa (NFC, bo khoang trang dau cuoi). */
export const hashSituation = (tokenized) =>
  crypto.createHash('sha256').update(String(tokenized).normalize('NFC').trim()).digest('hex');

/** Nhan vat -> dang so sanh duoc (giu thu tu: thu tu quyet dinh token). */
export const characterKey = (characters) => characters.map((c) => ({ characterId: c.characterId, isMain: Boolean(c.isMain) }));

/**
 * @param {object} p
 * @param {string} p.ownerId
 * @param {string} p.situationHash
 * @param {{characterId:string,isMain:boolean}[]} p.characters
 * @param {string|null} p.momentSummary  dang token
 * @param {string|null} p.seedEvent      dang token
 * @param {{id:string,source:string}[]} p.subSkills  dau = ky nang chinh
 * @returns {{ token: string, expiresAt: Date }}
 */
export function signAnalysisToken(p, secret, { now = new Date(), ttlMs = ANALYSIS_TTL_MS } = {}) {
  if (!secret) throw new Error('signAnalysisToken: thieu secret');
  const expiresAt = new Date(now.getTime() + ttlMs);
  const payload = {
    v: VERSION,
    own: p.ownerId,
    sh: p.situationHash,
    ch: characterKey(p.characters),
    ms: p.momentSummary ?? null,
    se: p.seedEvent ?? null,
    ss: p.subSkills.map((s) => ({ id: s.id, source: s.source })),
    exp: expiresAt.getTime(),
  };
  const body = b64(JSON.stringify(payload));
  return { token: `${body}.${b64(mac(secret, body))}`, expiresAt };
}

/**
 * Tra payload neu chu ky dung, chua het han va dung chu; nguoc lai null (khong noi ly do cho client).
 */
export function verifyAnalysisToken(token, secret, { ownerId, now = new Date() } = {}) {
  if (typeof token !== 'string' || !secret) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = mac(secret, body);
  let given;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload?.v !== VERSION || !Number.isFinite(payload.exp) || payload.exp <= now.getTime()) return null;
  if (ownerId && payload.own !== ownerId) return null;
  if (!Array.isArray(payload.ch) || !Array.isArray(payload.ss) || payload.ss.length < 1 || payload.ss.length > 2) return null;
  return {
    ownerId: payload.own,
    situationHash: payload.sh,
    characters: payload.ch,
    momentSummary: payload.ms ?? null,
    seedEvent: payload.se ?? null,
    subSkills: payload.ss,
    expiresAt: new Date(payload.exp),
  };
}

/** Hai danh sach nhan vat giong het (ca thu tu). */
export const sameCharacters = (a, b) => JSON.stringify(characterKey(a)) === JSON.stringify(characterKey(b));
