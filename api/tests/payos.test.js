import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';

process.env.PAYOS_CLIENT_ID = 'test-client';
process.env.PAYOS_API_KEY = 'test-api-key';
process.env.PAYOS_CHECKSUM_KEY = 'test-checksum-key';

const { default: payosService } = await import('../src/services/payos.service.js');

// Payload mau trong tai lieu payOS (phan data)
const sampleData = {
  orderCode: 123,
  amount: 3000,
  description: 'VQRIO123',
  accountNumber: '12345678',
  reference: 'TF230204212323',
  transactionDateTime: '2023-02-04 18:25:00',
  currency: 'VND',
  paymentLinkId: '124c33293c43417ab7879e14c8d9eb18',
  code: '00',
  desc: 'Thành công',
  counterAccountBankId: '',
  counterAccountBankName: '',
  counterAccountName: null,
  counterAccountNumber: '',
  virtualAccountName: '',
  virtualAccountNumber: '',
};

const sign = (data) =>
  createHmac('sha256', 'test-checksum-key').update(payosService.buildWebhookSignString(data)).digest('hex');

test('buildWebhookSignString: sap xep key, null thanh chuoi rong', () => {
  const str = payosService.buildWebhookSignString({ b: 2, a: 1, c: null });
  assert.equal(str, 'a=1&b=2&c=');
});

test('verifyWebhookSignature: chu ky dung duoc chap nhan', () => {
  const body = { code: '00', desc: 'success', success: true, data: sampleData, signature: sign(sampleData) };
  assert.equal(payosService.verifyWebhookSignature(body), true);
});

test('verifyWebhookSignature: sua so tien thi chu ky sai', () => {
  const body = { code: '00', success: true, data: { ...sampleData, amount: 1 }, signature: sign(sampleData) };
  assert.equal(payosService.verifyWebhookSignature(body), false);
});

test('verifyWebhookSignature: thieu chu ky bi tu choi', () => {
  assert.equal(payosService.verifyWebhookSignature({ data: sampleData }), false);
  assert.equal(payosService.verifyWebhookSignature(null), false);
});
