import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNameContext } from '../../src/modules/stories/lib/names.js';
import { findGenerationNameIssues } from '../../src/modules/stories/lib/preflight.js';

// Con: Bin (nhan vat {NV1}), Na (chi ton tai o ho so con, khong la nhan vat cua truyen).
const nameContext = buildNameContext({
  storyCharacters: [
    { token: '{NV1}', name: 'Bin', childId: 'c-bin' },
    { token: '{NV2}', name: 'Mít', childId: null },
  ],
  children: [
    { id: 'c-bin', name: 'Bin' },
    { id: 'c-na', name: 'Na' },
  ],
});

const clean = () => ({
  characters: [
    { token: '{NV1}', name: 'Bin', appearance: 'bé trai 6 tuổi, tóc ngắn' },
    { token: '{NV2}', name: 'Mít', appearance: 'chú mèo, bạn thân của Bin' },
  ],
  situation: '{NV1} giận {NV2}.',
  pages: [
    { pageOrder: 1, contentText: '{NV1} đi học.' },
    { pageOrder: 2, contentText: null },
  ],
  checkpoints: [
    {
      afterPageOrder: 2,
      question: '{NV1} thấy sao?',
      hint: null,
      options: [{ optionOrder: 1, text: 'Vui', feedback: null }],
    },
  ],
});

test('noi dung sach (ten nhan vat trong appearance duoc token hoa) -> khong co van de', () => {
  assert.deepEqual(findGenerationNameIssues(clean(), nameContext), []);
});

test('appearance chua ten con khong la nhan vat -> van de chi ro nhan vat', () => {
  const input = clean();
  input.characters[1].appearance = 'chú mèo của Na';
  const issues = findGenerationNameIssues(input, nameContext);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].path, 'characters.{NV2}.appearance');
  assert.equal(issues[0].name, 'Na');
  assert.match(issues[0].message, /Mô tả nhân vật "Mít" chứa tên "Na" chưa có trong truyện/);
});

test('situation, chu trang, cau hoi/goi y/phuong an/phan hoi chua ten sot -> moi cho mot van de', () => {
  const input = clean();
  input.situation = '{NV1} giận Na.';
  input.pages[1].contentText = 'Na khóc.';
  input.checkpoints[0].question = 'Na thấy sao?';
  input.checkpoints[0].hint = 'Nhớ lại Na.';
  input.checkpoints[0].options[0].text = 'Na vui';
  input.checkpoints[0].options[0].feedback = 'Đúng rồi, Na vui.';
  const issues = findGenerationNameIssues(input, nameContext);
  assert.deepEqual(
    issues.map((i) => i.path),
    [
      'situation',
      'pages.2.contentText',
      'checkpoints.2.question',
      'checkpoints.2.hint',
      'checkpoints.2.options.1.text',
      'checkpoints.2.options.1.feedback',
    ],
  );
  assert.ok(issues.every((i) => i.name === 'Na'));
  assert.match(issues[0].message, /Tình huống chứa tên "Na"/);
  assert.match(issues[1].message, /Trang 2 chứa tên "Na"/);
  assert.match(issues[2].message, /Điểm dừng sau trang 2 chứa tên "Na"/);
});

test('ten nhan vat con sot NGUYEN VAN trong chu da luu (khong token hoa) -> van bi bat', () => {
  // Chu da luu la chu da token hoa; ten nhan vat nguyen van o day nghia la du lieu sai -> AI se chan.
  const input = clean();
  input.situation = 'Bin giận {NV2}.';
  const issues = findGenerationNameIssues(input, nameContext);
  assert.deepEqual(issues.map((i) => [i.path, i.name]), [['situation', 'Bin']]);
});

test('khong co ten cam -> khong co van de; truong null/rong bi bo qua', () => {
  const ctx = buildNameContext({ storyCharacters: [], children: [] });
  const input = clean();
  input.situation = null;
  input.characters[0].appearance = null;
  assert.deepEqual(findGenerationNameIssues(input, ctx), []);
});

test('nhan vat khong ten (alias rong) -> dung token lam nhan', () => {
  const input = clean();
  input.characters = [{ token: '{NV3}', name: null, appearance: 'Na' }];
  const [issue] = findGenerationNameIssues(input, nameContext);
  assert.match(issue.message, /Mô tả nhân vật "\{NV3\}"/);
});
