import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';
import { env, prisma } from '../config/index.js';

/**
 * Authentication middleware - verifies JWT from Authorization header.
 * Attaches the authenticated user to req.user.
 */
const auth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Access token is missing');
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, env.jwt.secret);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        username: true,
        email: true,
        fullName: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw ApiError.unauthorized('User not found or deactivated');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Invalid or expired access token'));
    }
    next(error);
  }
};

export default auth;
