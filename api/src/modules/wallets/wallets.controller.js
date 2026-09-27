import walletsService from './wallets.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const getMyWallet = catchAsync(async (req, res) => {
  const wallet = await walletsService.getMyWallet(req.user.id);
  return ApiResponse.success(res, {
    data: { wallet },
  });
});

const getMyLedger = catchAsync(async (req, res) => {
  const result = await walletsService.getMyLedger(req.user.id, req.query);
  return ApiResponse.success(res, {
    data: result,
  });
});

const adminGrantCredits = catchAsync(async (req, res) => {
  const wallet = await walletsService.adminGrantCredits(req.user.id, req.body);
  return ApiResponse.success(res, {
    message: 'Credits granted successfully',
    data: { wallet },
  });
});

const requestWithdrawal = catchAsync(async (req, res) => {
  const withdrawal = await walletsService.requestWithdrawal(req.user.id, req.body);
  return ApiResponse.created(res, {
    message: 'Withdrawal requested successfully',
    data: { withdrawal },
  });
});

const getMyWithdrawals = catchAsync(async (req, res) => {
  const result = await walletsService.getMyWithdrawals(req.user.id, req.query);
  return ApiResponse.success(res, {
    data: result,
  });
});

const cancelMyWithdrawal = catchAsync(async (req, res) => {
  const withdrawal = await walletsService.cancelMyWithdrawal(req.user.id, req.params.id);
  return ApiResponse.success(res, {
    message: 'Withdrawal request cancelled successfully',
    data: { withdrawal },
  });
});

const getAdminWithdrawals = catchAsync(async (req, res) => {
  const result = await walletsService.getAdminWithdrawals(req.query);
  return ApiResponse.success(res, {
    data: result,
  });
});

const processWithdrawal = catchAsync(async (req, res) => {
  const withdrawal = await walletsService.processWithdrawal(req.user.id, req.params.id, req.body);
  return ApiResponse.success(res, {
    message: `Withdrawal request marked as ${withdrawal.status} successfully`,
    data: { withdrawal },
  });
});

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
