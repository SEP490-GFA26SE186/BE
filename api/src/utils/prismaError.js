import ApiError from './ApiError.js';

/**
 * Map loi cua Prisma sang ApiError.
 *
 * Tra ve `null` neu khong nhan ra — de errorConverter tu xu ly (500).
 * KHONG doan bua: ma nao chua map thi tra null, hon la gan sai status.
 *
 * Hai nhom loi, xu ly khac nhau:
 *
 *  1. Loi Prisma BIET  -> co `err.code` dang P####, va thuong co `err.meta`.
 *     Bao gom ca vi pham PARTIAL UNIQUE INDEX viet tay: Prisma khong biet
 *     index do ton tai nhung van doc duoc ten cot tu Postgres -> P2002.
 *
 *  2. Loi Prisma KHONG BIET -> CHECK constraint va trigger. Prisma khong mo
 *     hinh hoa hai thu nay nen KHONG co `code`, KHONG co `meta`; SQLSTATE chi
 *     con nam trong chuoi message. Buoc phai doc bang regex.
 *
 *     Quan trong: message do chua ca `detail: Some("Failing row contains (...)")`
 *     — tuc TOAN BO dong du lieu bi tu choi. Voi `wallets` / `orders` do la so du
 *     va so tien. Tuyet doi khong duoc chuyen message goc ra client; chi lay ten
 *     constraint (metadata schema, khong phai du lieu nguoi dung).
 */

/** SQLSTATE nam trong message cua loi khong ro: `code: "23514"` */
const SQLSTATE_PATTERN = /code:\s*"([0-9A-Z]{5})"/;

/** Ten constraint trong message; dau nhay co the bi escape thanh \" */
const CONSTRAINT_PATTERN = /constraint\s+\\?"([a-z0-9_]+)\\?"/i;

const PRISMA_CODE_PATTERN = /^P\d{4}$/;

/** Ten field tu meta.target cua P2002 — co the la mang hoac chuoi. */
const formatTarget = (target) => {
  if (Array.isArray(target)) return target.join(', ');
  if (typeof target === 'string') return target;
  return null;
};

const fromPrismaCode = (err) => {
  switch (err.code) {
    case 'P2002': {
      const fields = formatTarget(err.meta?.target);
      return ApiError.conflict(
        fields ? `Resource already exists: ${fields}` : 'Resource already exists',
      );
    }

    case 'P2003':
      return ApiError.conflict('Related resource does not exist or is still referenced');

    case 'P2025':
      return ApiError.notFound('Resource not found');

    case 'P2000':
      return ApiError.badRequest('A provided value is too long for its column');

    case 'P2034':
      // Deadlock / write conflict trong transaction — client thu lai duoc.
      return ApiError.conflict('Write conflict, please retry');

    default:
      return null;
  }
};

const fromSqlState = (err) => {
  const sqlState = err.message.match(SQLSTATE_PATTERN)?.[1];
  if (!sqlState) return null;

  const constraint = err.message.match(CONSTRAINT_PATTERN)?.[1];

  switch (sqlState) {
    case '23514': // check_violation
      return ApiError.badRequest(
        constraint ? `Data violates constraint ${constraint}` : 'Data violates a database constraint',
      );

    case 'P0001': // raise_exception — trigger cua chung ta, vd wallet_ledger append-only
      return ApiError.conflict('Operation not allowed by a database rule');

    case '23505': // unique_violation — thuong Prisma da bat thanh P2002
      return ApiError.conflict('Resource already exists');

    case '23503': // foreign_key_violation
      return ApiError.conflict('Related resource does not exist or is still referenced');

    case '23502': // not_null_violation
      return ApiError.badRequest('A required field is missing');

    default:
      return null;
  }
};

const toApiError = (err) => {
  if (!err || typeof err.message !== 'string') return null;

  if (typeof err.code === 'string' && PRISMA_CODE_PATTERN.test(err.code)) {
    // Ma Prisma chua map van co the mang SQLSTATE trong message (vd P2010 raw query).
    return fromPrismaCode(err) ?? fromSqlState(err);
  }

  // Loi he thong (ENOENT...) hoac loi thuong: chi thu doc SQLSTATE neu co dau hieu
  // day la loi tu tang ket noi cua Prisma.
  if (typeof err.code === 'string') return null;

  return fromSqlState(err);
};

export default toApiError;
