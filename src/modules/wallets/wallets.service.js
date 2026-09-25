import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { ApiError } from '../../utils/index.js';

// ==========================================
// 1. WALLET DETAILS & LEDGER
// ==========================================

const getMyWallet = async (userId) => {
  let wallet = await prisma.wallet.findUnique({
    where: { userId },
  });

  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: {
        userId,
        creditBalance: 0,
        earningPendingVnd: 0n,
        earningAvailableVnd: 0n,
        earningLockedVnd: 0n,
      },
    });
  }

  return wallet;
};

const getMyLedger = async (userId, query = {}) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const where = { userId };
  if (query.walletType) {
    where.walletType = query.walletType;
  }

  const [total, entries] = await Promise.all([
    prisma.walletLedger.count({ where }),
    prisma.walletLedger.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    entries,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ==========================================
// 2. ADMIN CREDIT GRANT
// ==========================================

const adminGrantCredits = async (adminId, { userId, credits, reason }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  return prisma.$transaction(async (tx) => {
    let wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await tx.wallet.create({
        data: {
          userId,
          creditBalance: 0,
          earningPendingVnd: 0n,
          earningAvailableVnd: 0n,
          earningLockedVnd: 0n,
        },
      });
    }

    const newBalance = wallet.creditBalance + credits;

    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        creditBalance: newBalance,
      },
    });

    await tx.walletLedger.create({
      data: {
        userId,
        walletType: 'credit',
        entryType: 'credit_admin_grant',
        amount: BigInt(credits),
        balanceAfter: BigInt(newBalance),
        idempotencyKey: `admin-grant-${crypto.randomUUID()}`,
        refType: reason ? `admin_grant:${reason.slice(0, 35)}` : 'admin_grant',
        refId: adminId,
      },
    });

    return updatedWallet;
  });
};

// ==========================================
// 3. WITHDRAWALS (CREATOR EARNINGS PAYOUT)
// ==========================================

const requestWithdrawal = async (userId, { amountVnd }) => {
  const seller = await prisma.sellerProfile.findUnique({
    where: { userId },
  });

  if (!seller || seller.status !== 'approved') {
    throw new ApiError(403, 'You must have an approved seller profile to request withdrawals');
  }

  if (!seller.bankName || !seller.bankAccountNumber || !seller.bankAccountHolder) {
    throw new ApiError(
      400,
      'Please update your bank payout details in your seller profile before requesting withdrawals'
    );
  }

  const existingPending = await prisma.withdrawalRequest.findFirst({
    where: {
      sellerId: userId,
      status: 'requested',
    },
  });

  if (existingPending) {
    throw new ApiError(400, 'You already have a pending withdrawal request in progress');
  }

  const requestedAmount = BigInt(amountVnd);

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet || wallet.earningAvailableVnd < requestedAmount) {
      throw new ApiError(400, 'Insufficient available earnings balance for this withdrawal');
    }

    const newAvailable = wallet.earningAvailableVnd - requestedAmount;
    const newLocked = wallet.earningLockedVnd + requestedAmount;

    await tx.wallet.update({
      where: { userId },
      data: {
        earningAvailableVnd: newAvailable,
        earningLockedVnd: newLocked,
      },
    });

    const withdrawal = await tx.withdrawalRequest.create({
      data: {
        sellerId: userId,
        amountVnd: requestedAmount,
        bankSnapshot: {
          bankName: seller.bankName,
          bankAccountNumber: seller.bankAccountNumber,
          bankAccountHolder: seller.bankAccountHolder,
        },
        status: 'requested',
      },
    });

    await tx.walletLedger.create({
      data: {
        userId,
        walletType: 'earning',
        entryType: 'withdrawal_hold',
        amount: -requestedAmount,
        balanceAfter: newAvailable,
        idempotencyKey: `withdrawal-hold-${crypto.randomUUID()}`,
        refType: 'withdrawal_request',
        refId: withdrawal.id,
      },
    });

    return withdrawal;
  });
};

const getMyWithdrawals = async (userId, query = {}) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const where = { sellerId: userId };
  if (query.status) {
    where.status = query.status;
  }

  const [total, requests] = await Promise.all([
    prisma.withdrawalRequest.count({ where }),
    prisma.withdrawalRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    requests,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const cancelMyWithdrawal = async (userId, withdrawalId) => {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
  });

  if (!withdrawal || withdrawal.sellerId !== userId) {
    throw new ApiError(404, 'Withdrawal request not found');
  }

  if (withdrawal.status !== 'requested') {
    throw new ApiError(400, 'Only pending withdrawal requests can be cancelled');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: 'cancelled',
      },
    });

    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    const newAvailable = wallet.earningAvailableVnd + withdrawal.amountVnd;
    const newLocked = wallet.earningLockedVnd - withdrawal.amountVnd;

    await tx.wallet.update({
      where: { userId },
      data: {
        earningAvailableVnd: newAvailable,
        earningLockedVnd: newLocked >= 0n ? newLocked : 0n,
      },
    });

    await tx.walletLedger.create({
      data: {
        userId,
        walletType: 'earning',
        entryType: 'withdrawal_release',
        amount: withdrawal.amountVnd,
        balanceAfter: newAvailable,
        idempotencyKey: `withdrawal-cancel-${crypto.randomUUID()}`,
        refType: 'withdrawal_request',
        refId: withdrawal.id,
      },
    });

    return updated;
  });
};

const getAdminWithdrawals = async (query = {}) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const where = {};
  if (query.status) {
    where.status = query.status;
  }

  const [total, requests] = await Promise.all([
    prisma.withdrawalRequest.count({ where }),
    prisma.withdrawalRequest.findMany({
      where,
      skip,
      take: limit,
      include: {
        seller: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        handledBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    requests,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const processWithdrawal = async (adminId, withdrawalId, { status, bankTransactionRef, rejectReason }) => {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
  });

  if (!withdrawal) {
    throw new ApiError(404, 'Withdrawal request not found');
  }

  if (withdrawal.status !== 'requested') {
    throw new ApiError(400, 'Withdrawal request has already been processed or cancelled');
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const wallet = await tx.wallet.findUnique({
      where: { userId: withdrawal.sellerId },
    });

    if (status === 'paid') {
      const newLocked = wallet.earningLockedVnd - withdrawal.amountVnd;

      await tx.wallet.update({
        where: { userId: withdrawal.sellerId },
        data: {
          earningLockedVnd: newLocked >= 0n ? newLocked : 0n,
        },
      });

      const updated = await tx.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status: 'paid',
          handledById: adminId,
          handledAt: now,
          bankTransactionRef,
        },
      });

      await tx.walletLedger.create({
        data: {
          userId: withdrawal.sellerId,
          walletType: 'earning',
          entryType: 'withdrawal_paid',
          amount: -withdrawal.amountVnd,
          balanceAfter: wallet.earningAvailableVnd,
          idempotencyKey: `withdrawal-paid-${crypto.randomUUID()}`,
          refType: 'withdrawal_request',
          refId: withdrawal.id,
        },
      });

      return updated;
    }

    if (status === 'rejected') {
      const newAvailable = wallet.earningAvailableVnd + withdrawal.amountVnd;
      const newLocked = wallet.earningLockedVnd - withdrawal.amountVnd;

      await tx.wallet.update({
        where: { userId: withdrawal.sellerId },
        data: {
          earningAvailableVnd: newAvailable,
          earningLockedVnd: newLocked >= 0n ? newLocked : 0n,
        },
      });

      const updated = await tx.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status: 'rejected',
          handledById: adminId,
          handledAt: now,
          rejectReason,
        },
      });

      await tx.walletLedger.create({
        data: {
          userId: withdrawal.sellerId,
          walletType: 'earning',
          entryType: 'withdrawal_release',
          amount: withdrawal.amountVnd,
          balanceAfter: newAvailable,
          idempotencyKey: `withdrawal-reject-${crypto.randomUUID()}`,
          refType: 'withdrawal_request',
          refId: withdrawal.id,
        },
      });

      return updated;
    }

    throw new ApiError(400, 'Invalid status decision');
  });
};

export default {
  getMyWallet,
  getMyLedger,
  adminGrantCredits,
  requestWithdrawal,
  getMyWithdrawals,
  cancelMyWithdrawal,
  getAdminWithdrawals,
  processWithdrawal,
};
