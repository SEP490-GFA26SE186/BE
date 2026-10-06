import test from 'node:test';
import assert from 'node:assert/strict';

const {
  blankToNull,
  editedOrigin,
  checkCheckpointEdit,
  newCheckpointFields,
  resolveCheckpointTarget,
  customLayoutFromRows,
  findReviewGaps,
} = await import('../../src/modules/stories/lib/editorRules.js');

const is400 = (e) => e.statusCode === 400;
const is422 = (e) => e.statusCode === 422;
const paths = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.errors.map((x) => x.path);
  }
  throw new Error('khong nem');
};

const perspectiveOpts = () => [
  { text: 'A', isCorrect: true },
  { text: 'B', isCorrect: false },
  { text: 'C', isCorrect: false },
];
const psOpts = () => [
  { text: 'A', role: 'constructive', feedback: 'fa' },
  { text: 'B', role: 'avoidant', feedback: 'fb' },
  { text: 'C', role: 'impulsive', feedback: 'fc' },
];

// ---------------------------------------------------------------------------

test('blankToNull: chuoi trong / khoang trang / null -> null; con lai giu nguyen', () => {
  assert.equal(blankToNull(''), null);
  assert.equal(blankToNull('  \n '), null);
  assert.equal(blankToNull(null), null);
  assert.equal(blankToNull(undefined), null);
  assert.equal(blankToNull(' Bin đi học. '), ' Bin đi học. ');
});

test('editedOrigin: ai -> ai_edited; human, ai_edited giu nguyen', () => {
  assert.equal(editedOrigin('ai'), 'ai_edited');
  assert.equal(editedOrigin('human'), 'human');
  assert.equal(editedOrigin('ai_edited'), 'ai_edited');
});

// ---------------------------------------------------------------------------
// checkCheckpointEdit
// ---------------------------------------------------------------------------

test('kieu cam xuc: gui question ma thieu answerEmotion -> 400', () => {
  for (const type of ['emotion_self', 'emotion_other']) {
    assert.throws(() => checkCheckpointEdit(type, { question: 'Bạn thấy sao?' }), is400);
    assert.deepEqual(paths(() => checkCheckpointEdit(type, { question: 'Q?' })), ['answerEmotion']);
    assert.doesNotThrow(() => checkCheckpointEdit(type, { question: 'Q?', answerEmotion: 'sad', hint: 'H' }));
  }
});

test('kieu cam xuc: xoa trang question khong bat answerEmotion; chi sua hint cung duoc', () => {
  assert.doesNotThrow(() => checkCheckpointEdit('emotion_self', { question: null }));
  assert.doesNotThrow(() => checkCheckpointEdit('emotion_self', { question: '  ' }));
  assert.doesNotThrow(() => checkCheckpointEdit('emotion_self', { hint: 'H' }));
  assert.doesNotThrow(() => checkCheckpointEdit('emotion_other', { answerEmotion: 'happy' }));
});

test('kieu cam xuc khong co phuong an; kieu khac khong co answerEmotion', () => {
  assert.deepEqual(paths(() => checkCheckpointEdit('emotion_self', { options: perspectiveOpts() })), ['options']);
  for (const type of ['perspective', 'problem_solving', 'reflection']) {
    assert.deepEqual(paths(() => checkCheckpointEdit(type, { answerEmotion: 'sad' })), ['answerEmotion']);
  }
});

test('reflection gui options -> 400', () => {
  assert.throws(() => checkCheckpointEdit('reflection', { question: 'Q?', options: [] }), is400);
  assert.throws(() => checkCheckpointEdit('reflection', { options: psOpts() }), is400);
  assert.doesNotThrow(() => checkCheckpointEdit('reflection', { question: 'Q?' }));
});

test('perspective: dung 3 phuong an, dung 1 dap an dung', () => {
  assert.doesNotThrow(() => checkCheckpointEdit('perspective', { question: 'Q?', options: perspectiveOpts() }));
  // 2 phuong an
  assert.throws(() => checkCheckpointEdit('perspective', { options: perspectiveOpts().slice(0, 2) }), is400);
  // 2 dap an dung
  const two = perspectiveOpts();
  two[1].isCorrect = true;
  assert.deepEqual(paths(() => checkCheckpointEdit('perspective', { options: two })), ['options']);
  // khong co dap an dung
  const none = perspectiveOpts();
  none[0].isCorrect = false;
  assert.throws(() => checkCheckpointEdit('perspective', { options: none }), is400);
});

test('perspective: thieu isCorrect / gui role hoac feedback -> 400 dung path', () => {
  const missing = perspectiveOpts();
  delete missing[2].isCorrect;
  assert.ok(paths(() => checkCheckpointEdit('perspective', { options: missing })).includes('options.2.isCorrect'));
  const withRole = perspectiveOpts();
  withRole[0].role = 'constructive';
  assert.ok(paths(() => checkCheckpointEdit('perspective', { options: withRole })).includes('options.0.role'));
  const withFeedback = perspectiveOpts();
  withFeedback[1].feedback = 'x';
  assert.ok(paths(() => checkCheckpointEdit('perspective', { options: withFeedback })).includes('options.1.feedback'));
});

test('problem_solving: thieu vai -> 400; vai trung -> 400; isCorrect -> 400', () => {
  assert.doesNotThrow(() => checkCheckpointEdit('problem_solving', { question: 'Q?', options: psOpts() }));

  const noRole = psOpts();
  delete noRole[1].role;
  assert.throws(() => checkCheckpointEdit('problem_solving', { options: noRole }), is400);
  assert.ok(paths(() => checkCheckpointEdit('problem_solving', { options: noRole })).includes('options.1.role'));

  const dup = psOpts();
  dup[2].role = 'constructive';
  assert.deepEqual(paths(() => checkCheckpointEdit('problem_solving', { options: dup })), ['options']);

  const withCorrect = psOpts();
  withCorrect[0].isCorrect = true;
  assert.ok(paths(() => checkCheckpointEdit('problem_solving', { options: withCorrect })).includes('options.0.isCorrect'));

  assert.throws(() => checkCheckpointEdit('problem_solving', { options: psOpts().slice(0, 2) }), is400);
});

test('phuong an cho phep chu trong (luu nhap), review moi bat du', () => {
  const draft = psOpts().map((o) => ({ ...o, text: '', feedback: null }));
  assert.doesNotThrow(() => checkCheckpointEdit('problem_solving', { options: draft }));
});

// ---------------------------------------------------------------------------
// newCheckpointFields / resolveCheckpointTarget
// ---------------------------------------------------------------------------

test('newCheckpointFields: kieu cam xuc dat answerEmotion neutral; kieu khac null', () => {
  assert.deepEqual(newCheckpointFields('emotion_self', null), { type: 'emotion_self', targetToken: null, answerEmotion: 'neutral' });
  assert.deepEqual(newCheckpointFields('emotion_other', '{NV2}'), { type: 'emotion_other', targetToken: '{NV2}', answerEmotion: 'neutral' });
  assert.deepEqual(newCheckpointFields('reflection', null), { type: 'reflection', targetToken: null, answerEmotion: null });
});

const cast = [
  { token: '{NV1}', isMain: true },
  { token: '{NV2}', isMain: false },
  { token: '{NV3}', isMain: false },
];

test('resolveCheckpointTarget: emotion_other/perspective khong gui -> nhan vat phu dau tien', () => {
  assert.equal(resolveCheckpointTarget('emotion_other', undefined, cast), '{NV2}');
  assert.equal(resolveCheckpointTarget('perspective', null, cast), '{NV2}');
  assert.equal(resolveCheckpointTarget('perspective', '{NV3}', cast), '{NV3}');
});

test('resolveCheckpointTarget: kieu khong can target -> null', () => {
  for (const type of ['emotion_self', 'problem_solving', 'reflection']) {
    assert.equal(resolveCheckpointTarget(type, undefined, cast), null);
  }
});

test('resolveCheckpointTarget: khong co nhan vat phu / target la nhan vat chinh / khong co trong truyen -> 422', () => {
  assert.throws(() => resolveCheckpointTarget('emotion_other', undefined, [cast[0]]), is422);
  assert.throws(() => resolveCheckpointTarget('perspective', '{NV1}', cast), is422);
  assert.throws(() => resolveCheckpointTarget('perspective', '{NV9}', cast), is422);
});

// ---------------------------------------------------------------------------
// customLayoutFromRows
// ---------------------------------------------------------------------------

test('customLayoutFromRows: so trang + afterPageOrder theo id trang', () => {
  const pages = [
    { id: 'p3', pageOrder: 3 },
    { id: 'p1', pageOrder: 1 },
    { id: 'p2', pageOrder: 2 },
    { id: 'p4', pageOrder: 4 },
  ];
  const cps = [
    { type: 'reflection', afterPageId: 'p4' },
    { type: 'emotion_self', afterPageId: 'p2' },
  ];
  assert.deepEqual(customLayoutFromRows(pages, cps), {
    pageCount: 4,
    checkpoints: [
      { type: 'reflection', afterPageOrder: 4 },
      { type: 'emotion_self', afterPageOrder: 2 },
    ],
  });
});

// ---------------------------------------------------------------------------
// findReviewGaps
// ---------------------------------------------------------------------------

test('findReviewGaps: du -> []', () => {
  const pages = [
    { id: 'a', pageOrder: 1, contentText: 'x' },
    { id: 'b', pageOrder: 2, contentText: 'y' },
  ];
  const checkpoints = [{ id: 'k', afterPageId: 'b', type: 'reflection', question: 'Q?', hint: null, options: [] }];
  assert.deepEqual(findReviewGaps({ pages, checkpoints }), []);
});

test('findReviewGaps: liet ke trang trong va diem dung thieu truong, theo thu tu trang', () => {
  const pages = [
    { id: 'c', pageOrder: 3, contentText: '' },
    { id: 'a', pageOrder: 1, contentText: 'x' },
    { id: 'b', pageOrder: 2, contentText: null },
  ];
  const checkpoints = [
    { id: 'k3', afterPageId: 'c', type: 'reflection', question: 'Q?', options: [] },
    { id: 'k2', afterPageId: 'b', type: 'emotion_self', question: 'Q?', hint: '', options: [] },
  ];
  const gaps = findReviewGaps({ pages, checkpoints });
  assert.deepEqual(gaps.map((g) => g.path), ['pages.b', 'pages.c', 'checkpoints.k2']);
  assert.match(gaps[0].message, /Trang 2/);
  assert.match(gaps[2].message, /sau trang 2/);
  assert.match(gaps[2].message, /hint/);
});
