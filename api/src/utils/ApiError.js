import { StatusCodes } from 'http-status-codes';

class ApiError extends Error {
  constructor(statusCode, message, errors = [], isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errors = []) {
    return new ApiError(StatusCodes.BAD_REQUEST, message, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(StatusCodes.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(StatusCodes.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(StatusCodes.NOT_FOUND, message);
  }

  static conflict(message) {
    return new ApiError(StatusCodes.CONFLICT, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, message, [], false);
  }
}

export default ApiError;
