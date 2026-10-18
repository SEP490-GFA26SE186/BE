import test from 'node:test';
import assert from 'node:assert/strict';
import { aliasErrors, claimedByOther, leftoverNameErrors, reviewProgress } from '../../src/modules/publishing/lib/publish.js';

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

test('reviewProgress: chi duyet khi xem du trang VA dat du checklist', () => {
  const p = reviewProgress(['a', 'b'], ['a'], ['c1', 'c2'], [{ checklistItemId: 'c1', passed: true }, { checklistItemId: 'c2', passed: true }]);
  assert.equal(p.canApprove, false);
  assert.equal(reviewProgress(['a'], ['a'], ['c1'], [{ checklistItemId: 'c1', passed: false }]).canApprove, false);
  assert.equal(reviewProgress(['a'], ['a', 'x'], ['c1'], [{ checklistItemId: 'c1', passed: true }]).canApprove, true);
});

test('claimedByOther: chi khi nguoi khac giu va con han', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  const later = new Date('2026-10-18T10:10:00Z');
  assert.equal(claimedByOther({ moderatorId: 'm2', claimExpiresAt: later }, 'm1', now), true);
  assert.equal(claimedByOther({ moderatorId: 'm1', claimExpiresAt: later }, 'm1', now), false);
  assert.equal(claimedByOther({ moderatorId: 'm2', claimExpiresAt: new Date('2026-10-18T09:00:00Z') }, 'm1', now), false);
});
