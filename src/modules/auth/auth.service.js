import bcrypt from 'bcryptjs';
import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';
import tokenService from './token.service.js';

/**
 * Register a new user
 * @param {Object} userData
 * @param {string} userData.username
 * @param {string} userData.email
 * @param {string} userData.password
 * @param {string} [userData.fullName]
 * @param {string} [userData.phone]
 * @returns {Promise<Object>} { user, tokens }
 */
const register = async ({ username, email, password, fullName, phone }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = username.trim();

  // Check if username or email is already taken
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        { username: normalizedUsername },
      ],
    },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });

  if (existingUser) {
    if (existingUser.email.toLowerCase() === normalizedEmail) {
      throw ApiError.conflict('Email is already registered');
    }
    if (existingUser.username.toLowerCase() === normalizedUsername.toLowerCase()) {
      throw ApiError.conflict('Username is already taken');
    }
  }

  // Hash the password with bcrypt (cost factor = 10)
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user and initialize wallet inside an atomic transaction
  const newUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        fullName: fullName?.trim() || normalizedUsername,
        phone: phone?.trim() || null,
        role: 'parent',
      },
      select: {
        id: true,
        role: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Initialize user wallet
    await tx.wallet.create({
      data: {
        userId: user.id,
        creditBalance: 0,
        earningPendingVnd: 0n,
        earningAvailableVnd: 0n,
        earningLockedVnd: 0n,
      },
    });

    return user;
  });

  // Generate initial tokens
  const tokens = await tokenService.generateAuthTokens(newUser);

  return {
    user: newUser,
    tokens,
  };
};

/**
 * Authenticate user with email/username and password
 * @param {Object} credentials
 * @param {string} [credentials.emailOrUsername]
 * @param {string} [credentials.email]
 * @param {string} [credentials.username]
 * @param {string} credentials.password
 * @returns {Promise<Object>} { user, tokens }
 */
const login = async ({ emailOrUsername, email, username, password }) => {
  const identifier = (emailOrUsername || email || username).trim();

  // Find user by email or username
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier.toLowerCase() },
        { username: identifier },
      ],
    },
  });

  // Generic unauthorized error to avoid user enumeration
  if (!user || user.deletedAt) {
    throw ApiError.unauthorized('Invalid email/username or password');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('Your account has been deactivated. Please contact support.');
  }

  // Verify password
  const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordMatch) {
    throw ApiError.unauthorized('Invalid email/username or password');
  }

  // Update last login timestamp asynchronously
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Generate tokens
  const tokens = await tokenService.generateAuthTokens(user);

  return {
    user: {
      id: user.id,
      role: user.role,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    },
    tokens,
  };
};

/**
 * Refresh access token using a valid refresh token
 * @param {string} refreshToken
 * @returns {Promise<Object>} { user, tokens }
 */
const refreshTokens = async (refreshToken) => {
  return await tokenService.verifyAndRotateRefreshToken(refreshToken);
};

/**
 * Logout user by revoking the refresh token
 * @param {string} refreshToken
 */
const logout = async (refreshToken) => {
  await tokenService.revokeRefreshToken(refreshToken);
};

/**
 * Get current user profile by user ID
 * @param {string} userId
 * @returns {Promise<Object>} Safe user record
 */
const getUserProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      username: true,
      email: true,
      fullName: true,
      phone: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
      wallet: {
        select: {
          creditBalance: true,
          earningAvailableVnd: true,
        },
      },
    },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user;
};

export default {
  register,
  login,
  refreshTokens,
  logout,
  getUserProfile,
};
