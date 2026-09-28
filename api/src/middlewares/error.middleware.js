import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import toApiError from '../utils/prismaError.js';
import { env } from '../config/index.js';

/**
 * Convert non-ApiError errors to ApiError
 */
const errorConverter = (err, _req, _res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    // Loi cua Prisma duoc map truoc. Neu khong thi message goc se roi thang ra
    // client duoi dang 500 — voi vi pham CHECK, message do chua CA dong du lieu
    // bi tu choi (so du vi, so tien don). Xem src/utils/prismaError.js.
    const mapped = toApiError(error);

    if (mapped) {
      mapped.stack = err.stack;
      // Giu loi goc: client chi thay message an toan, nhung log van con day du
      // constraint / SQLSTATE de chan doan.
      mapped.cause = err;
      error = mapped;
    } else {
      const statusCode = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
      const message = error.message || 'Internal server error';
      error = new ApiError(statusCode, message, [], false);
      error.stack = err.stack;
    }
  }

  next(error);
};

/**
 * Global error handler - sends JSON error response
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  const { statusCode, message, errors } = err;

  const response = {
    success: false,
    message,
  };

  if (errors && errors.length > 0) {
    response.errors = errors;
  }

  // Stack trace is logged to server console below, hidden from client response

  console.error('[ERROR]', err);

  res.status(statusCode).json(response);
};

export { errorConverter, errorHandler };
