import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import { env } from '../config/index.js';

/**
 * Convert non-ApiError errors to ApiError
 */
const errorConverter = (err, _req, _res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    const message = error.message || 'Internal server error';
    error = new ApiError(statusCode, message, [], false);
    error.stack = err.stack;
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

  if (env.nodeEnv === 'development') {
    response.stack = err.stack;
  }

  console.error('[ERROR]', err);

  res.status(statusCode).json(response);
};

export { errorConverter, errorHandler };
