import test from 'node:test';
import assert from 'node:assert/strict';

const { parseStorySettings, loadStorySettings } = await import(
  '../../src/modules/stories/lib/storySettings.js'
);

const fullRows = () => [
  { key: 'story_layout.short', value: { pages: 6, checkpoints: [
    { type: 'emotion_self', after: 2 }, { type: 'perspective', after: 3 },
    { type: 'problem_solving', after: 4 }, { type: 'reflection', after: 6 }] } },
  { key: 'story_layout.medium', value: { pages: 8, checkpoints: [
    { type: 'emotion_self', after: 2 }, { type: 'perspective', after: 4},
    { type: 'problem_solving', after: 5 }, { type: 'reflection', after: 8 }] } },
  { key: 'story_layout.long', value: { pages: 10, checkpoints: [
    { type: 'emotion_self', after: 2 }, { type: 'perspective', after: 4 },
    { type: 'problem_solving', after: 6 }, { type: 'emotion_other', after: 8 },
    { type: 'reflection', after: 10 }] } },
  { key: 'limits.page_min_words', value: 20 },
  { key: 'limits.page_max_words', value: 70 },
  { key: 'limits.page_target_min_words', value: 40 },
  { key: 'limits.page_target_max_words', value: 60 },
  { key: 'limits.sentence_max_words', value: 15 },
  { key: 'limits.question_max_words', value: 15 },
  { key: 'limits.option_max_words', value: 12 },
  { key: 'limits.hint_max_words', value: 20 },
  { key: 'limits.feedback_max_words', value: 25 },
  { key: 'limits.max_scenes', value: 4 },
  { key: 'custom_limits.min_pages', value: 4 },
  { key: 'custom_limits.max_pages', value: 20 },
  { key: 'custom_limits.max_checkpoints', value: 6 },
  { key: 'ai_cost.story_text', value: 1 },
];

test('parseStorySettings: bo dong day du -> dung cau truc, limits giu snake_case', () => {
  const s = parseStorySettings(fullRows());
  assert.equal(s.layouts.short.pages, 6);
  assert.equal(s.layouts.long.checkpoints.length, 5);
  assert.deepEqual(s.layouts.medium.checkpoints[1], { type: 'perspective', after: 4 });
  assert.deepEqual(s.limits, {
    page_min_words: 20, page_max_words: 70, page_target_min_words: 40, page_target_max_words: 60,
    sentence_max_words: 15,
    question_max_words: 15, option_max_words: 12, hint_max_words: 20,
    feedback_max_words: 25, max_scenes: 4,
  });
  assert.deepEqual(s.customLimits, { minPages: 4, maxPages: 20, maxCheckpoints: 6 });
  assert.equal(s.storyTextCost, 1);
});

test('parseStorySettings: thieu khoa -> loi liet ke du moi khoa thieu', () => {
  const rows = fullRows().filter(
    (r) => !['limits.max_scenes', 'story_layout.long', 'ai_cost.story_text'].includes(r.key),
  );
  assert.throws(
    () => parseStorySettings(rows),
    (e) => {
      assert.equal(e.statusCode, 500);
      for (const k of ['limits.max_scenes', 'story_layout.long', 'ai_cost.story_text']) {
        assert.ok(e.message.includes(k), `thieu ${k} trong: ${e.message}`);
      }
      assert.ok(!e.message.includes('limits.page_min_words'));
      return true;
    },
  );
});

test('parseStorySettings: layout co after vuot pages -> loi', () => {
  const rows = fullRows();
  rows[0].value.checkpoints[3].after = 7;
  assert.throws(() => parseStorySettings(rows), /story_layout\.short/);
});

test('parseStorySettings: ai_cost.story_text am -> loi', () => {
  const rows = fullRows().map((r) => (r.key === 'ai_cost.story_text' ? { ...r, value: -1 } : r));
  assert.throws(() => parseStorySettings(rows), /ai_cost\.story_text/);
});

test('loadStorySettings: doc dung cac tien to roi parse', async () => {
  let where;
  const db = {
    platformSetting: {
      findMany: async (args) => { where = args.where; return fullRows(); },
    },
  };
  const s = await loadStorySettings(db);
  assert.equal(s.storyTextCost, 1);
  const prefixes = where.OR.filter((c) => typeof c.key === 'object').map((c) => c.key.startsWith);
  assert.deepEqual(prefixes, ['story_layout.', 'limits.', 'custom_limits.']);
  assert.ok(where.OR.some((c) => c.key === 'ai_cost.story_text'));
});

test('parseStorySettings: muc tieu tieng/trang phai nam trong [min, max] -> loi cau hinh', () => {
  const rows = fullRows().map((r) =>
    r.key === 'limits.page_target_max_words' ? { ...r, value: 80 } : r,
  );
  assert.throws(() => parseStorySettings(rows), (e) => {
    assert.ok(e.message.includes('page_target'));
    return true;
  });
});

test('parseStorySettings: thieu muc tieu tieng/trang -> loi, neu ten khoa', () => {
  const rows = fullRows().filter((r) => r.key !== 'limits.page_target_min_words');
  assert.throws(() => parseStorySettings(rows), (e) => {
    assert.ok(e.message.includes('limits.page_target_min_words'));
    return true;
  });
});
