import test from 'node:test';
import assert from 'node:assert/strict';

const { assertCustomLayout } = await import('../../src/modules/stories/lib/customRules.js');

const limits = { minPages: 4, maxPages: 20, maxCheckpoints: 6 };
const cp = (type, afterPageOrder) => ({ type, afterPageOrder });
const is422 = (e) => e.statusCode === 422;

test('hop le -> khong nem', () => {
  assert.doesNotThrow(() =>
    assertCustomLayout({ pageCount: 8, checkpoints: [cp('emotion_self', 2), cp('reflection', 8)] }, limits));
  assert.doesNotThrow(() => assertCustomLayout({ pageCount: 4, checkpoints: [] }, limits));
});
test('3 trang -> loi', () => assert.throws(() => assertCustomLayout({ pageCount: 3, checkpoints: [] }, limits), is422));
test('21 trang -> loi', () => assert.throws(() => assertCustomLayout({ pageCount: 21, checkpoints: [] }, limits), is422));
test('7 diem dung -> loi', () => {
  const cps = [2, 3, 4, 5, 6, 7, 8].map((n) => cp('emotion_self', n));
  assert.throws(() => assertCustomLayout({ pageCount: 10, checkpoints: cps }, limits), is422);
});
test('dat sau trang 1 -> loi', () =>
  assert.throws(() => assertCustomLayout({ pageCount: 5, checkpoints: [cp('emotion_self', 1)] }, limits), is422));
test('reflection khong o trang cuoi -> loi', () =>
  assert.throws(() => assertCustomLayout({ pageCount: 5, checkpoints: [cp('reflection', 3)] }, limits), is422));
test('hai diem dung cung trang -> loi', () =>
  assert.throws(() =>
    assertCustomLayout({ pageCount: 5, checkpoints: [cp('emotion_self', 3), cp('perspective', 3)] }, limits), is422));
test('diem dung sau trang vuot so trang -> loi', () =>
  assert.throws(() => assertCustomLayout({ pageCount: 5, checkpoints: [cp('emotion_self', 6)] }, limits), is422));
