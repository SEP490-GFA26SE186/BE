import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env, prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';

/**
 * Hash token using SHA-256 for secure database lookup
 * @param {string} token
 * @returns {string} Hex-encoded SHA-256 hash
 */
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Parse human duration string into milliseconds
 * @param {string} str - e.g. "15m", "7d", "1h", "60s"
 * @returns {number} Milliseconds
 */
export const parseDuration = (str) => {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return num * 1000;
    case 'm':
      return num * 60 * 1000;
    case 'h':
      return num * 60 * 60 * 1000;
    case 'd':
      return num * 24 * 60 * 60 * 1000;
    default:
      return num * 1000;
  }
};

/**
 * Generate Access Token and Refresh Token for a user
 * @param {Object} user - User record { id, role }
 * @returns {Promise<Object>} { accessToken, refreshToken, expiresIn }
 */
export const generateAuthTokens = async (user) => {
  // 1. Generate JWT Access Token
  const accessToken = jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    env.jwt.secret,
    {
      expiresIn: env.jwt.expiresIn,
    },
  );

  // 2. Generate opaque Refresh Token
  const rawRefreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawRefreshToken);
  const refreshExpiresInMs = parseDuration(env.jwt.refreshExpiresIn);
  const expiresAt = new Date(Date.now() + refreshExpiresInMs);

  // 3. Persist Refresh Token into database
  await prisma.authToken.create({
    data: {
      userId: user.id,
      type: 'refresh',
      tokenHash,
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: env.jwt.expiresIn,
  };
};

/**
 * Verify and rotate a refresh token (Token Rotation Security Pattern)
 * @param {string} rawRefreshToken
 * @returns {Promise<Object>} { user, tokens }
 */
export const verifyAndRotateRefreshToken = async (rawRefreshToken) => {
  const tokenHash = hashToken(rawRefreshToken);

  const existingToken = await prisma.authToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          username: true,
          email: true,
          fullName: true,
          phone: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });

  // Security check: token must exist, be of type refresh, and not yet consumed
  if (!existingToken || existingToken.type !== 'refresh' || existingToken.consumedAt !== null) {
    throw ApiError.unauthorized('Invalid or already used refresh token');
  }

  // Check expiration
  if (existingToken.expiresAt < new Date()) {
    throw ApiError.unauthorized('Refresh token has expired');
  }

  const { user } = existingToken;
  if (!user || !user.isActive || user.deletedAt) {
    throw ApiError.unauthorized('User not found or deactivated');
  }

  // Generate new tokens
  const newAccessToken = jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    env.jwt.secret,
    {
      expiresIn: env.jwt.expiresIn,
    },
  );

  const newRawRefreshToken = crypto.randomBytes(40).toString('hex');
  const newTokenHash = hashToken(newRawRefreshToken);
  const refreshExpiresInMs = parseDuration(env.jwt.refreshExpiresIn);
  const newExpiresAt = new Date(Date.now() + refreshExpiresInMs);

  // Atomically consume old token and create new token with replacement link
  await prisma.$transaction(async (tx) => {
    const createdToken = await tx.authToken.create({
      data: {
        userId: user.id,
        type: 'refresh',
        tokenHash: newTokenHash,
        expiresAt: newExpiresAt,
      },
    });

    await tx.authToken.update({
      where: { id: existingToken.id },
      data: {
        consumedAt: new Date(),
        replacedById: createdToken.id,
      },
    });
  });

  return {
    user,
    tokens: {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: env.jwt.expiresIn,
    },
  };
};

/**
 * Revoke a refresh token (e.g. on logout)
 * @param {string} rawRefreshToken
 */
export const revokeRefreshToken = async (rawRefreshToken) => {
  const tokenHash = hashToken(rawRefreshToken);

  const existingToken = await prisma.authToken.findUnique({
    where: { tokenHash },
  });

  if (existingToken && existingToken.consumedAt === null) {
    await prisma.authToken.update({
      where: { id: existingToken.id },
      data: {
        consumedAt: new Date(),
      },
    });
  }
};

/**
 * Generate an email verification token (expires in 24 hours)
 * @param {string} userId
 * @returns {Promise<string>} Raw verification token
 */
export const generateEmailVerificationToken = async (userId) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.$transaction(async (tx) => {
    // Invalidate any previous unconsumed verification tokens for this user
    await tx.authToken.updateMany({
      where: {
        userId,
        type: 'email_verify',
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    // Save new verification token
    await tx.authToken.create({
      data: {
        userId,
        type: 'email_verify',
        tokenHash,
        expiresAt,
      },
    });
  });

  return rawToken;
};

/**
 * Verify and consume an email verification token
 * @param {string} rawToken
 * @returns {Promise<Object>} Verified user
 */
export const verifyEmailToken = async (rawToken) => {
  const tokenHash = hashToken(rawToken);

  const tokenRecord = await prisma.authToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!tokenRecord || tokenRecord.type !== 'email_verify' || tokenRecord.consumedAt !== null) {
    throw ApiError.badRequest('Invalid or already used verification token');
  }

  if (tokenRecord.expiresAt < new Date()) {
    throw ApiError.badRequest('Email verification token has expired. Please request a new one.');
  }

  // Atomically mark token consumed and verify user email
  const updatedUser = await prisma.$transaction(async (tx) => {
    await tx.authToken.update({
      where: { id: tokenRecord.id },
      data: { consumedAt: new Date() },
    });

    return await tx.user.update({
      where: { id: tokenRecord.userId },
      data: { emailVerifiedAt: new Date() },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerifiedAt: true,
      },
    });
  });

  return updatedUser;
};

/**
 * Generate a scoped Kid Session Token for reading in Kid Mode
 * @param {Object} parentUser
 * @param {string} childId
 * @returns {Promise<Object>} { kidSessionToken, expiresIn }
 */
export const generateKidSessionToken = async (parentUser, childId) => {
  const kidSessionToken = jwt.sign(
    {
      sub: parentUser.id,
      childId,
      role: 'child',
      type: 'kid_session',
    },
    env.jwt.secret,
    {
      expiresIn: '24h',
    },
  );

  const tokenHash = hashToken(kidSessionToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    // Invalidate any active kid sessions for this specific child
    await tx.authToken.updateMany({
      where: {
        childId,
        type: 'kid_session',
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    // Create new kid_session record
    await tx.authToken.create({
      data: {
        userId: parentUser.id,
        childId,
        type: 'kid_session',
        tokenHash,
        expiresAt,
      },
    });
  });

  return {
    kidSessionToken,
    expiresIn: '24h',
  };
};

/**
 * Verify and consume a Kid Session Token upon exit
/**
 * Verify a Kid Session Token without consuming it
 * @param {string} kidSessionToken
 * @returns {Promise<Object>} { user, childId, tokenId }
 */
export const verifyKidSessionToken = async (kidSessionToken) => {
  const tokenHash = hashToken(kidSessionToken);

  const tokenRecord = await prisma.authToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!tokenRecord || tokenRecord.type !== 'kid_session' || tokenRecord.consumedAt !== null) {
    throw ApiError.unauthorized('Invalid or already closed kid session');
  }

  if (tokenRecord.expiresAt < new Date()) {
    throw ApiError.unauthorized('Kid session has expired');
  }

  return {
    user: tokenRecord.user,
    childId: tokenRecord.childId,
    tokenId: tokenRecord.id,
  };
};

/**
 * Mark a Kid Session token as consumed
 * @param {string} tokenId
 */
export const consumeKidSessionToken = async (tokenId) => {
  await prisma.authToken.update({
    where: { id: tokenId },
    data: { consumedAt: new Date() },
  });
};

export default {
  hashToken,
  parseDuration,
  generateAuthTokens,
  verifyAndRotateRefreshToken,
  revokeRefreshToken,
  generateEmailVerificationToken,
  verifyEmailToken,
  generateKidSessionToken,
  verifyKidSessionToken,
  consumeKidSessionToken,
};
