import { StatusCodes } from 'http-status-codes';
import { ApiResponse, catchAsync } from '../../utils/index.js';
import billingService from './billing.service.js';

export default {
  checkoutPlan: catchAsync(async (req, res) =>
    ApiResponse.success(res, { statusCode: StatusCodes.CREATED, data: await billingService.checkoutPlan(req.user, req.body.planId) }),
  ),
  getOrder: catchAsync(async (req, res) =>
    ApiResponse.success(res, { data: { order: await billingService.getOrder(req.user, req.params.orderId) } }),
  ),
  // payOS chi can 2xx; tra ket qua de debug (khong lo du lieu nhay cam).
  payosWebhook: catchAsync(async (req, res) => res.status(StatusCodes.OK).json({ success: true, data: await billingService.handleWebhook(req.body) })),
};
