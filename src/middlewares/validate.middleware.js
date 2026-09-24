import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';

/**
 * Middleware factory that validates request data against a Zod schema.
 *
 * @param {import('zod').ZodObject} schema - Zod schema with optional keys: body, query, params
 * @returns {Function} Express middleware
 *
 * @example
 * import { z } from 'zod';
 * const schema = z.object({
 *   body: z.object({ email: z.string().email(), password: z.string().min(8) }),
 *   params: z.object({ id: z.string().uuid() }),
 * });
 * router.post('/:id', validate(schema), controller.update);
 */
const validate = (schema) => (req, _res, next) => {
  const dataToValidate = {};

  if (schema.shape.body) dataToValidate.body = req.body;
  if (schema.shape.query) dataToValidate.query = req.query;
  if (schema.shape.params) dataToValidate.params = req.params;

  const result = schema.safeParse(dataToValidate);

  if (!result.success) {
    const errorIssues = result.error.issues || result.error.errors || [];
    const errors = errorIssues.map((err) => {
      const pathArray =
        ['body', 'query', 'params'].includes(err.path[0])
          ? err.path.slice(1)
          : err.path;
      return {
        path: pathArray.join('.'),
        message: err.message,
      };
    });
    return next(new ApiError(StatusCodes.BAD_REQUEST, 'Validation failed', errors));
  }

  // Replace req data with parsed (and transformed) values
  if (result.data.body) req.body = result.data.body;
  if (result.data.query) req.query = result.data.query;
  if (result.data.params) req.params = result.data.params;

  return next();
};

export default validate;
