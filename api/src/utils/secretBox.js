// Ma hoa du lieu nhay cam luu DB (so tai khoan ngan hang — DBML seller_profiles "ma hoa khi luu").
// AES-256-GCM, khoa tu BANK_DATA_KEY (32 byte, hex hoac base64). Dinh dang luu: "v1:<iv>:<tag>:<data>"
// (base64url). Thieu khoa: dev dung khoa suy tu JWT_SECRET (canh bao); production bat buoc dat.
import crypto from 'node:crypto';

let cached;

function key() {
  if (cached) return cached;
  const raw = process.env.BANK_DATA_KEY;
  if (raw) {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (buf.length !== 32) throw new Error('BANK_DATA_KEY phải là 32 byte (64 ký tự hex hoặc base64).');
    cached = buf;
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error('Thiếu BANK_DATA_KEY (mã hoá số tài khoản ngân hàng).');
    console.warn('[secretBox] Chua dat BANK_DATA_KEY — dung khoa suy tu JWT_SECRET (chi dev).');
    cached = crypto.createHash('sha256').update(`bank:${process.env.JWT_SECRET ?? 'dev'}`).digest();
  }
  return cached;
}

export function seal(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join(':');
}

export function open(sealed) {
  const [v, iv, tag, data] = String(sealed).split(':');
  if (v !== 'v1') throw new Error('Định dạng dữ liệu mã hoá không hợp lệ.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

/** "0123456789" -> "******6789" de hien thi. */
export const maskAccount = (plain) => (plain ? `${'*'.repeat(Math.max(0, plain.length - 4))}${plain.slice(-4)}` : null);
