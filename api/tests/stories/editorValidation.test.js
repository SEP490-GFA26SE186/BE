import test from 'node:test';
import assert from 'node:assert/strict';

const v = (await import('../../src/modules/stories/stories.validation.js')).default;

const ID = '11111111-1111-4111-8111-111111111111';
const PAGE = '22222222-2222-4222-8222-222222222222';
const CP = '33333333-3333-4333-8333-333333333333';

const paths = (r) => r.error.issues.map((i) => i.path.join('.'));

// ---------------------------------------------------------------------------

test('updatePage: contentText bat buoc (chuoi hoac null)', () => {
  const ok = (body) => v.updatePage.safeParse({ params: { id: ID, pageId: PAGE }, body });
  assert.equal(ok({ contentText: '{NV1} đi học.' }).success, true);
  assert.equal(ok({ contentText: null }).success, true);
  assert.equal(ok({ contentText: '' }).success, true);
  assert.equal(ok({}).success, false);
  assert.equal(ok({ contentText: 'x'.repeat(2001) }).success, false);
  assert.equal(v.updatePage.safeParse({ params: { id: ID, pageId: 'x' }, body: { contentText: 'a' } }).success, false);
});

// ---------------------------------------------------------------------------

const cpBody = (body) => v.updateCheckpoint.safeParse({ params: { id: ID, cpId: CP }, body });

test('updateCheckpoint: can it nhat mot truong', () => {
  assert.equal(cpBody({}).success, false);
  assert.equal(cpBody({ hint: 'H' }).success, true);
  assert.equal(cpBody({ question: null }).success, true);
});

test('updateCheckpoint: answerEmotion chi nhan happy|sad|angry|scared|neutral', () => {
  for (const e of ['happy', 'sad', 'angry', 'scared', 'neutral']) {
    assert.equal(cpBody({ answerEmotion: e }).success, true);
  }
  const bad = cpBody({ answerEmotion: 'excited' });
  assert.equal(bad.success, false);
  assert.ok(paths(bad).includes('body.answerEmotion'));
  assert.equal(cpBody({ answerEmotion: null }).success, false);
});

test('updateCheckpoint: role cua phuong an chi nhan constructive|avoidant|impulsive', () => {
  const opts = (role) => [{ text: 'A', role, feedback: 'f' }];
  for (const role of ['constructive', 'avoidant', 'impulsive']) {
    assert.equal(cpBody({ options: opts(role) }).success, true);
  }
  const bad = cpBody({ options: opts('brave') });
  assert.equal(bad.success, false);
  assert.ok(paths(bad).includes('body.options.0.role'));
});

test('updateCheckpoint: isCorrect phai la boolean; options la mang', () => {
  assert.equal(cpBody({ options: [{ text: 'A', isCorrect: 'yes' }] }).success, false);
  assert.equal(cpBody({ options: 'abc' }).success, false);
});

// ---------------------------------------------------------------------------

const addPage = (body) => v.createPage.safeParse({ params: { id: ID }, body });

test('createPage: body rong hoac khong co body deu duoc; contentText tuy chon', () => {
  assert.equal(addPage(undefined).success, true);
  assert.equal(addPage({}).success, true);
  assert.equal(addPage({ contentText: 'x' }).success, true);
  assert.equal(addPage({ contentText: 5 }).success, false);
});

// ---------------------------------------------------------------------------

const addCp = (body) => v.createCheckpoint.safeParse({ params: { id: ID }, body });

test('createCheckpoint: type trong 5 kieu, afterPageId la uuid', () => {
  for (const type of ['emotion_self', 'emotion_other', 'perspective', 'problem_solving', 'reflection']) {
    assert.equal(addCp({ type, afterPageId: PAGE }).success, true);
  }
  assert.equal(addCp({ type: 'quiz', afterPageId: PAGE }).success, false);
  const badId = addCp({ type: 'reflection', afterPageId: 'page-2' });
  assert.equal(badId.success, false);
  assert.ok(paths(badId).includes('body.afterPageId'));
  assert.equal(addCp({ type: 'reflection' }).success, false);
});

test('createCheckpoint: targetToken dang {NVn}, chi cho emotion_other/perspective', () => {
  assert.equal(addCp({ type: 'emotion_other', afterPageId: PAGE, targetToken: '{NV2}' }).success, true);
  assert.equal(addCp({ type: 'perspective', afterPageId: PAGE, targetToken: '{NV3}' }).success, true);
  assert.equal(addCp({ type: 'perspective', afterPageId: PAGE, targetToken: 'Mít' }).success, false);
  assert.equal(addCp({ type: 'emotion_self', afterPageId: PAGE, targetToken: '{NV2}' }).success, false);
});

// ---------------------------------------------------------------------------

test('deletePage / deleteCheckpoint / reviewStory: chi kiem params', () => {
  assert.equal(v.deletePage.safeParse({ params: { id: ID, pageId: PAGE } }).success, true);
  assert.equal(v.deletePage.safeParse({ params: { id: ID, pageId: 'x' } }).success, false);
  assert.equal(v.deleteCheckpoint.safeParse({ params: { id: ID, cpId: CP } }).success, true);
  assert.equal(v.reviewStory.safeParse({ params: { id: ID } }).success, true);
  assert.equal(v.reviewStory.safeParse({ params: { id: 'x' } }).success, false);
});
