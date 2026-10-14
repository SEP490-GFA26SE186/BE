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

const createPlan = catchAsync(async (req, res) => {
  const plan = await plansService.createPlan(req.body);
  return ApiResponse.created(res, {
    message: 'Subscription plan created successfully',
    data: { plan },
  });
});

const updatePlan = catchAsync(async (req, res) => {
  const plan = await plansService.updatePlan(req.params.id, req.body);
  return ApiResponse.success(res, {
    message: 'Subscription plan updated successfully',
    data: { plan },
  });
});

const deletePlan = catchAsync(async (req, res) => {
  await plansService.deletePlan(req.params.id);
  return ApiResponse.success(res, {
    message: 'Subscription plan deactivated successfully',
  });
});

const getMySubscription = catchAsync(async (req, res) => {
  const result = await plansService.getMySubscription(req.user.id);
  return ApiResponse.success(res, {
    data: result,
  });
});

const subscribeFreePlan = catchAsync(async (req, res) => {
  const subscription = await plansService.subscribeFreePlan(req.user.id, req.body.planId);
  return ApiResponse.success(res, {
    message: 'Subscribed to free plan successfully',
    data: { subscription },
  });
});

const cancelMySubscription = catchAsync(async (req, res) => {
  const subscription = await plansService.cancelMySubscription(req.user.id);
  return ApiResponse.success(res, {
    message: 'Subscription cancelled successfully',
    data: { subscription },
  });
});

const getAllSubscriptions = catchAsync(async (req, res) => {
  const result = await plansService.getAllSubscriptions(req.query);
  return ApiResponse.success(res, {
    data: result,
  });
});

export default {
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  getMySubscription,
  subscribeFreePlan,
  cancelMySubscription,
  getAllSubscriptions,
};
