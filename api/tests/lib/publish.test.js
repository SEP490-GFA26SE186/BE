import test from 'node:test';
import assert from 'node:assert/strict';
import { aliasErrors, claimedByOther, leftoverNameErrors, reviewProgress, validPriceVnd } from '../../src/modules/publishing/lib/publish.js';

const chars = [{ token: '{NV1}' }, { token: '{NV2}' }];

test('aliasErrors: du, khac nhau, khong la ten that (khong phan biet hoa thuong)', () => {
  assert.deepEqual(aliasErrors(chars, [{ token: '{NV1}', aliasName: 'Bống' }, { token: '{NV2}', aliasName: 'Bà nội' }], ['Bin', 'Bà']), []);
  const errs = aliasErrors(chars, [{ token: '{NV1}', aliasName: 'bin' }, { token: '{NV2}', aliasName: '  ' }, { token: '{NV9}', aliasName: 'X' }], ['Bin']);
  assert.deepEqual(errs.map((e) => e.path).sort(), ['aliases.{NV1}', 'aliases.{NV2}', 'aliases.{NV9}']);
  const dup = aliasErrors(chars, [{ token: '{NV1}', aliasName: 'Na' }, { token: '{NV2}', aliasName: 'na' }], []);
  assert.equal(dup.length, 1);
});

test('leftoverNameErrors: quet trang, diem dung, phuong an va ten moi; khong quet ten truyen goc', () => {
  const story = {
    title: 'Bin và chậu hoa',
    pages: [{ id: 'p1', contentText: '{NV1} chơi.' }, { id: 'p2', contentText: 'Bin khóc.' }],
    checkpoints: [{ id: 'k1', question: '{NV1} thấy sao?', hint: null, options: [{ text: 'Ôm Bin', feedback: null }] }],
  };
  const errs = leftoverNameErrors(story, ['Bin'], 'Bé và chậu hoa');
  assert.deepEqual(errs.map((e) => e.path), ['pages.p2', 'checkpoints.k1']);
  assert.ok(leftoverNameErrors({ pages: [], checkpoints: [] }, ['Bin'], 'Truyện của Bin').some((e) => e.path === 'listing.title'));
});

test('tu xung ho ("Bà", "Mẹ") khong bi coi la ten that; ten rieng van bi chan', () => {
  const story = { pages: [{ id: 'p1', contentText: 'Bà xin lỗi con. Mẹ ôm {NV1}.' }], checkpoints: [] };
  assert.deepEqual(leftoverNameErrors(story, ['Bà', 'Mẹ'], 'Bé và bà'), []);
  assert.equal(leftoverNameErrors(story, ['Bà', 'Mẹ', 'Bin'], 'Bin và bà').length, 1);
  assert.deepEqual(aliasErrors([{ token: '{NV2}' }], [{ token: '{NV2}', aliasName: 'Bà' }], ['Bà']), [], 'giu "Bà" lam ten chung duoc');
});

test('reviewProgress: chi duyet khi xem du trang', () => {
  assert.deepEqual(reviewProgress(['a', 'b'], ['a']), { pagesTotal: 2, pagesViewed: 1, canApprove: false });
  assert.equal(reviewProgress(['a'], ['a', 'x']).canApprove, true);
});

test('validPriceVnd: 0 (mien phi) hoac 5.000-500.000, boi 1.000, so nguyen', () => {
  for (const v of [0, 5000, 19000, 499000, 500000]) assert.equal(validPriceVnd(v), true, String(v));
  for (const v of [-1000, 1000, 4000, 5500, 501000, 19000.5, '19000', null, undefined, NaN]) assert.equal(validPriceVnd(v), false, String(v));
});

test('claimedByOther: chi khi nguoi khac giu va con han', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  const later = new Date('2026-10-18T10:10:00Z');
  assert.equal(claimedByOther({ moderatorId: 'm2', claimExpiresAt: later }, 'm1', now), true);
  assert.equal(claimedByOther({ moderatorId: 'm1', claimExpiresAt: later }, 'm1', now), false);
  assert.equal(claimedByOther({ moderatorId: 'm2', claimExpiresAt: new Date('2026-10-18T09:00:00Z') }, 'm1', now), false);
});
