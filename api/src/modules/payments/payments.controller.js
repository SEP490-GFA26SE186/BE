import paymentsService from './payments.service.js';
import { catchAsync } from '../../utils/index.js';

/**
 * Webhook payOS. Luon tra 200 khi da ghi nhan (ke ca bi tu choi) de payOS khong gui lai;
 * ly do tu choi nam trong webhook_logs.error_message.
 */
const payosWebhook = catchAsync(async (req, res) => {
  const result = await paymentsService.handlePayosWebhook(req.body);
  res.status(200).json({ success: true, ...result });
});

export default {
  payosWebhook,
};
