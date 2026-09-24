import bcrypt from 'bcryptjs';
import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';

/**
 * Register a new user
 * @param {Object} userData
 * @param {string} userData.username
 * @param {string} userData.email
 * @param {string} userData.password
 * @param {string} [userData.fullName]
 * @param {string} [userData.phone]
 * @returns {Promise<Object>} Safe user data
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
        fullName: fullName?.trim() || null,
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

  return newUser;
};

export default {
  register,
};
