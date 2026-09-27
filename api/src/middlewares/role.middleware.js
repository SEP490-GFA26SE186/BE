import ApiError from '../utils/ApiError.js';

/**
 * Authorization middleware factory - checks if the authenticated user has one of the allowed roles.
 *
 * @param  {...string} allowedRoles - Roles permitted to access the route
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/admin-only', auth, authorize('admin'), controller.adminDashboard);
 * router.get('/mod-or-admin', auth, authorize('admin', 'moderator'), controller.list);
 */
const authorize = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }

  if (!allowedRoles.includes(req.user.role)) {
    return next(ApiError.forbidden('You do not have permission to access this resource'));
  }

  next();
};

export default authorize;
