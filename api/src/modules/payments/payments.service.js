import { prisma } from '../../config/index.js';
import payosService from '../../services/payos.service.js';
import { fulfillOrder } from '../orders/orders.service.js';

const ORDER_INCLUDE = {
  items: {
    include: {
      listing: { select: { id: true, sellerId: true } },
      plan: true,
    },
  },
};

const markLog = (client, logId, data) =>
  client.webhookLog.update({ where: { id: logId }, data });

/**
 * Xu ly webhook payOS: ghi webhook_logs, kiem tra chu ky, chuyen don pending -> paid
 * va cap quyen loi trong cung mot transaction. Idempotent: webhook lap lai khong cap hai lan.
 * @param {Object} body - payload payOS { code, desc, success, data, signature }
 * @returns {Promise<Object>} { processed, reason }
 */
const handlePayosWebhook = async (body) => {
  const signatureValid = payosService.verifyWebhookSignature(body);
  const rawOrderCode = body?.data?.orderCode;
  const orderCode = Number.isSafeInteger(Number(rawOrderCode)) ? BigInt(rawOrderCode) : null;

  const log = await prisma.webhookLog.create({
    data: {
      provider: 'payos',
      payosOrderCode: orderCode,
      payload: body ?? {},
      signatureValid,
    },
  });

  const reject = async (reason) => {
    await markLog(prisma, log.id, { errorMessage: reason });
    return { processed: false, reason };
  };

  if (!signatureValid) return reject('invalid signature');

  // Giao dich khong thanh cong: chi ghi log
  if (body.data.code !== '00') return reject(`payment not successful: ${body.data.code} ${body.data.desc ?? ''}`);

  if (orderCode === null) return reject('missing orderCode');

  const order = await prisma.order.findUnique({
    where: { payosOrderCode: orderCode },
    include: ORDER_INCLUDE,
  });
  // payOS gui giao dich mau khi xac nhan webhook URL -> khong co don tuong ung
  if (!order) return reject('order not found');

  if (BigInt(body.data.amount) !== order.totalVnd) {
    return reject(`amount mismatch: paid ${body.data.amount}, order ${order.totalVnd}`);
  }

  return prisma.$transaction(async (tx) => {
    // Chi mot webhook duoc chuyen don tu pending sang paid
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: 'pending' },
      data: {
        status: 'paid',
        paidAt: new Date(),
        payosTransactionId: body.data.reference || null,
        payosPaymentLinkId: body.data.paymentLinkId || order.payosPaymentLinkId,
      },
    });

    if (count === 0) {
      const reason =
        order.status === 'paid'
          ? 'duplicate webhook: order already paid'
          : `order is ${order.status} but was paid -> needs manual refund`;
      await markLog(tx, log.id, { processed: order.status === 'paid', errorMessage: reason });
      return { processed: false, reason };
    }

    const { skippedListings } = await fulfillOrder(tx, order);

    await markLog(tx, log.id, {
      processed: true,
      errorMessage:
        skippedListings.length > 0
          ? `buyer already owned listing(s) ${skippedListings.join(', ')} -> needs manual refund`
          : null,
    });

    return { processed: true, orderId: order.id };
  });
};

export default {
  handlePayosWebhook,
};
