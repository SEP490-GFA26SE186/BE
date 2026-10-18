import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';
import { env, prisma } from '../config/index.js';
import { verifyKidSessionToken } from '../modules/auth/token.service.js';

/**
 * Xac thuc Kid Mode: chi nhan token `kid_session` (POST /auth/kid-mode/enter) con hieu luc
 * (chua bi tieu thu khi thoat bang PIN, chua het han). Gan req.kid = { childId, parentId }.
 * Route cua be chi dung req.kid — khong bao gio req.user — de token be khong mo duoc gi cua phu huynh.
 */
const kidAuth = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized('Thiếu phiên Kid Mode.');
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, env.jwt.secret);
    if (payload.type !== 'kid_session') throw ApiError.forbidden('Chỉ dùng được trong Kid Mode.');

    const session = await verifyKidSessionToken(token);
    const child = await prisma.childProfile.findFirst({
      where: { id: session.childId, parentId: session.user.id, deletedAt: null },
      select: { id: true },
    });
    if (!child || !session.user.isActive || session.user.deletedAt) {
      throw ApiError.unauthorized('Phiên Kid Mode không còn hợp lệ.');
    }
    req.kid = { childId: session.childId, parentId: session.user.id };
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Phiên Kid Mode đã hết hạn.'));
    }
    next(error);
  }
};

export default kidAuth;
