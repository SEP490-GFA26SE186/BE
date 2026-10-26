import plansService from './plans.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const getPlans = catchAsync(async (_req, res) => {
  const plans = await plansService.getPlans();
  return ApiResponse.success(res, {
    data: { plans },
  });
});

const getPlanById = catchAsync(async (req, res) => {
  const plan = await plansService.getPlanById(req.params.id);
  return ApiResponse.success(res, {
    data: { plan },
  });
});

const getMySubscription = catchAsync(async (req, res) => {
  const result = await plansService.getMySubscription(req.user.id);
  return ApiResponse.success(res, {
    data: result,
  });
});

const getCreditHistory = catchAsync(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return ApiResponse.success(res, { data: await plansService.getCreditHistory(req.user.id, { page, limit }) });
});

export default {
  getCreditHistory,
  getPlans,
  getPlanById,
  getMySubscription,
};
