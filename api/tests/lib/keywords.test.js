import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedErrors, containsPhrase, keywordIssues, storyTextTargets } from '../../src/modules/stories/lib/keywords.js';

test('containsPhrase: nguyen tieng, khong phan biet hoa thuong, giu dau, NFC (khop validator ai/)', () => {
  assert.equal(containsPhrase('Hai bạn đánh nhau ở sân.', 'đánh nhau'), true);
  assert.equal(containsPhrase('Đánh nhau là không tốt.', 'đánh nhau'), true, 'dau cau viet hoa');
  assert.equal(containsPhrase('Bé đánh nhẹ vào trống.', 'đánh nhau'), false);
  assert.equal(containsPhrase('Ngủ ngon nhé.', 'ngu'), false, 'giu dau: ngủ khac ngu');
  assert.equal(containsPhrase('Đồ ngu!', 'ngu'), true);
  assert.equal(containsPhrase('bạn nguyên', 'ngu'), false, 'khong khop giua tieng');
  assert.equal(containsPhrase('Đa\u0301nh nhau', 'đánh nhau'), true, 'NFC: dau to hop');
});

test('keywordIssues + blockedErrors: chi `block` thanh loi 422, `warn` giu lam canh bao', () => {
  const story = {
    pages: [{ id: 'p1', contentText: '{NV1} và bạn đánh nhau.' }, { id: 'p2', contentText: 'Đồ ngu!' }],
    checkpoints: [{ id: 'k1', question: 'Vì sao?', hint: null, options: [{ text: 'Đánh nhau tiếp', feedback: null }] }],
  };
  const kws = [{ keyword: 'đánh nhau', severity: 'block' }, { keyword: 'ngu', severity: 'warn' }];
  const issues = keywordIssues(storyTextTargets(story), kws);
  assert.deepEqual(issues.map((i) => [i.path, i.severity]), [['pages.p1', 'block'], ['pages.p2', 'warn'], ['checkpoints.k1', 'block']]);
  const errs = blockedErrors(issues);
  assert.deepEqual(errs.map((e) => e.path), ['pages.p1', 'checkpoints.k1']);
  assert.match(errs[0].message, /đánh nhau/);
});
