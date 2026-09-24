import bcrypt from 'bcryptjs';
import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';
import tokenService from './token.service.js';
import emailService from '../../services/email.service.js';

/**
 * Register a new user
 * @param {Object} userData
 * @returns {Promise<Object>} { user, tokens }
 */
const register = async ({ username, email, password, fullName, phone }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = username.trim();

  // Check if username or email is already taken
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalizedEmail }, { username: normalizedUsername }],
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

  // Generate initial auth tokens
  const tokens = await tokenService.generateAuthTokens(newUser);

  // Send email verification asynchronously without blocking registration
  tokenService
    .generateEmailVerificationToken(newUser.id)
    .then((verifyToken) => {
      emailService.sendVerificationEmail(newUser.email, verifyToken, newUser.fullName || newUser.username);
    })
    .catch((err) => {
      console.error('Failed to send registration verification email:', err.message);
    });

  return {
    user: newUser,
    tokens,
  };
};

/**
 * Authenticate user with email/username and password
 * @param {Object} credentials
 * @returns {Promise<Object>} { user, tokens }
 */
const login = async ({ emailOrUsername, email, username, password }) => {
  const identifier = (emailOrUsername || email || username).trim();

  // Find user by email or username
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identifier.toLowerCase() }, { username: identifier }],
    },
  });

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
      hasKidPin: !!user.kidExitPinHash,
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
      kidExitPinHash: true,
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

  return {
    ...user,
    hasKidPin: !!user.kidExitPinHash,
    kidExitPinHash: undefined, // Do not expose hash
  };
};

// =============================================================================
// KID PIN & KID MODE
// =============================================================================

/**
 * Set Kid Exit PIN for the first time
 * @param {string} userId
 * @param {string} pin - 4 to 6 numeric digits
 */
const setKidPin = async (userId, pin) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, kidExitPinHash: true },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (user.kidExitPinHash) {
    throw ApiError.badRequest('Kid Exit PIN is already set. Use change-pin endpoint to change it.');
  }

  const kidExitPinHash = await bcrypt.hash(pin, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { kidExitPinHash },
  });

  return { message: 'Kid Exit PIN has been set successfully' };
};

/**
 * Change existing Kid Exit PIN
 * @param {string} userId
 * @param {Object} options
 * @param {string} [options.currentPin]
 * @param {string} [options.password]
 * @param {string} options.newPin
 */
const changeKidPin = async (userId, { currentPin, password, newPin }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, kidExitPinHash: true, passwordHash: true },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (!user.kidExitPinHash) {
    throw ApiError.badRequest('Kid Exit PIN has not been set yet. Please set it first.');
  }

  if (currentPin) {
    const isPinMatch = await bcrypt.compare(currentPin, user.kidExitPinHash);
    if (!isPinMatch) {
      throw ApiError.badRequest('Current PIN is incorrect');
    }
  } else if (password) {
    const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordMatch) {
      throw ApiError.badRequest('Account password is incorrect');
    }
  }

  const newPinHash = await bcrypt.hash(newPin, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { kidExitPinHash: newPinHash },
  });

  return { message: 'Kid Exit PIN changed successfully' };
};

/**
 * Enter Kid Mode for a specific child
 * @param {string} parentId
 * @param {string} childId
 * @returns {Promise<Object>} { child, session: { kidSessionToken, expiresIn } }
 */
const enterKidMode = async (parentId, childId) => {
  const parent = await prisma.user.findUnique({
    where: { id: parentId },
    select: { id: true, role: true, kidExitPinHash: true },
  });

  if (!parent) {
    throw ApiError.notFound('Parent account not found');
  }

  if (!parent.kidExitPinHash) {
    throw ApiError.forbidden('You must set a Kid Exit PIN before entering Kid Mode');
  }

  // Ensure child profile belongs to this parent and is active
  const child = await prisma.childProfile.findFirst({
    where: {
      id: childId,
      parentId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      birthDate: true,
      dailyScreenTimeMinutes: true,
      bedtimeStart: true,
      bedtimeEnd: true,
      preferredVoice: true,
    },
  });

  if (!child) {
    throw ApiError.notFound('Child profile not found or does not belong to this account');
  }

  const session = await tokenService.generateKidSessionToken(parent, child.id);

  return {
    child,
    session,
  };
};

/**
 * Exit Kid Mode by verifying PIN and consuming session token
 * @param {Object} options
 * @param {string} options.pin
 * @param {string} [options.kidSessionToken]
 * @param {string} [options.userId]
 * @returns {Promise<Object>} { message, tokens }
 */
const exitKidMode = async ({ pin, kidSessionToken, userId }) => {
  let parentUser = null;
  let tokenIdToConsume = null;

  if (kidSessionToken) {
    const sessionData = await tokenService.verifyKidSessionToken(kidSessionToken);
    parentUser = sessionData.user;
    tokenIdToConsume = sessionData.tokenId;
  } else if (userId) {
    parentUser = await prisma.user.findUnique({
      where: { id: userId },
    });
  }

  if (!parentUser) {
    throw ApiError.unauthorized('No active session or user found to exit from Kid Mode');
  }

  if (!parentUser.kidExitPinHash) {
    throw ApiError.badRequest('No PIN configured for this account');
  }

  const isPinMatch = await bcrypt.compare(pin, parentUser.kidExitPinHash);
  if (!isPinMatch) {
    throw ApiError.unauthorized('Incorrect Kid Exit PIN');
  }

  // Consume kid session token only after successful PIN verification
  if (tokenIdToConsume) {
    await tokenService.consumeKidSessionToken(tokenIdToConsume);
  }

  // Generate fresh parent tokens to transition back to full Parent mode
  const parentTokens = await tokenService.generateAuthTokens(parentUser);

  return {
    message: 'Exited Kid Mode successfully',
    tokens: parentTokens,
  };
};

// =============================================================================
// EMAIL VERIFICATION
// =============================================================================

/**
 * Send email verification link to user
 * @param {Object} options
 * @param {string} [options.userId]
 * @param {string} [options.email]
 */
const sendVerificationEmail = async ({ userId, email }) => {
  let user = null;

  if (userId) {
    user = await prisma.user.findUnique({ where: { id: userId } });
  } else if (email) {
    user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim() },
    });
  }

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (user.emailVerifiedAt) {
    throw ApiError.badRequest('Email is already verified');
  }

  const rawToken = await tokenService.generateEmailVerificationToken(user.id);
  await emailService.sendVerificationEmail(user.email, rawToken, user.fullName || user.username);

  return { message: 'Verification email sent successfully' };
};

/**
 * Verify user email address with token
 * @param {string} rawToken
 * @returns {Promise<Object>} Verified user info
 */
const verifyEmail = async (rawToken) => {
  const verifiedUser = await tokenService.verifyEmailToken(rawToken);
  return {
    message: 'Email verified successfully',
    user: verifiedUser,
  };
};

export default {
  register,
  login,
  refreshTokens,
  logout,
  getUserProfile,
  setKidPin,
  changeKidPin,
  enterKidMode,
  exitKidMode,
  sendVerificationEmail,
  verifyEmail,
};
