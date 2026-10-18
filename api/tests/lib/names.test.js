import test from 'node:test';
import assert from 'node:assert/strict';

const { buildNameContext, tokenizeNames, findLeftoverNames } = await import(
  '../../src/modules/stories/lib/names.js'
);

test('buildNameContext: ten nhan vat -> token cua no', () => {
  const { nameMap } = buildNameContext({
    storyCharacters: [{ token: '{NV1}', name: 'Bin', childId: null }],
    children: [],
  });
  assert.deepEqual(nameMap, [{ name: 'Bin', token: '{NV1}' }]);
});

test('buildNameContext: ten con gan voi nhan vat dung chung token nhan vat', () => {
  const { nameMap, forbiddenTerms } = buildNameContext({
    storyCharacters: [{ token: '{NV1}', name: 'Bé An', childId: 'c1' }],
    children: [{ id: 'c1', name: 'An' }],
  });
  assert.deepEqual(nameMap.find((m) => m.name === 'An'), { name: 'An', token: '{NV1}' });
  assert.deepEqual(nameMap.find((m) => m.name === 'Bé An'), { name: 'Bé An', token: '{NV1}' });
  assert.deepEqual(forbiddenTerms.sort(), ['An', 'Bé An']);
});

test('buildNameContext: con khong phai nhan vat chi nam trong forbiddenTerms, khong trung lap', () => {
  const { nameMap, forbiddenTerms } = buildNameContext({
    storyCharacters: [{ token: '{NV1}', name: 'Bin', childId: null }],
    children: [{ id: 'c1', name: 'Mai' }, { id: 'c2', name: 'Mai' }],
  });
  assert.equal(nameMap.some((m) => m.name === 'Mai'), false);
  assert.deepEqual(forbiddenTerms.sort(), ['Bin', 'Mai']);
});

const ctx = (storyCharacters, children = []) => buildNameContext({ storyCharacters, children }).nameMap;

test('tokenizeNames: thay ten, giu nguyen tu chua ten', () => {
  const map = ctx([{ token: '{NV1}', name: 'An', childId: null }]);
  assert.equal(tokenizeNames('An đi học', map), '{NV1} đi học');
  assert.equal(tokenizeNames('an toàn', map), 'an toàn');
  assert.equal(tokenizeNames('An toàn', map), '{NV1} toàn');
  assert.equal(tokenizeNames('Ân ơi', map), 'Ân ơi');
  assert.equal(tokenizeNames('Chào An. Chào An, nhé', map), 'Chào {NV1}. Chào {NV1}, nhé');
});

test('tokenizeNames: phan biet hoa thuong', () => {
  const map = ctx([{ token: '{NV1}', name: 'An', childId: null }]);
  assert.equal(tokenizeNames('an đi', map), 'an đi');
});

test('tokenizeNames: ten dai truoc', () => {
  const map = ctx([
    { token: '{NV1}', name: 'Bin', childId: null },
    { token: '{NV2}', name: 'Bin Bin', childId: null },
  ]);
  assert.equal(tokenizeNames('Bin Bin và Bin', map), '{NV2} và {NV1}');
});

test('tokenizeNames: con An + nhan vat An Nhien', () => {
  const map = ctx([
    { token: '{NV1}', name: 'An Nhiên', childId: null },
    { token: '{NV2}', name: 'An', childId: null },
  ], [{ id: 'c1', name: 'An' }]);
  assert.equal(tokenizeNames('An Nhiên chơi với An', map), '{NV1} chơi với {NV2}');
});

test('tokenizeNames: NFD khop ten NFC', () => {
  const map = ctx([{ token: '{NV1}', name: 'Đức'.normalize('NFC'), childId: null }]);
  assert.equal(tokenizeNames('Đức'.normalize('NFD') + ' chạy', map), '{NV1} chạy');
});

test('tokenizeNames: null -> null, map rong giu nguyen', () => {
  assert.equal(tokenizeNames(null, []), null);
  assert.equal(tokenizeNames('An', []), 'An');
});

test('tokenizeNames: ky tu regex trong ten khong lam vo', () => {
  const map = ctx([{ token: '{NV1}', name: 'A.B', childId: null }]);
  assert.equal(tokenizeNames('A.B và AxB', map), '{NV1} và AxB');
});

test('findLeftoverNames', () => {
  const { forbiddenTerms } = buildNameContext({
    storyCharacters: [{ token: '{NV1}', name: 'Bin', childId: null }],
    children: [{ id: 'c1', name: 'Mai' }],
  });
  assert.deepEqual(findLeftoverNames('Mai đi chơi', forbiddenTerms), ['Mai']);
  assert.deepEqual(findLeftoverNames('Bin đi chơi', forbiddenTerms), ['Bin']);
  assert.deepEqual(findLeftoverNames('Mainh đi chơi', forbiddenTerms), []);
  assert.deepEqual(findLeftoverNames('{NV1} đi chơi', forbiddenTerms), []);
  assert.deepEqual(findLeftoverNames(null, forbiddenTerms), []);
});

test('tokenize roi findLeftoverNames -> rong khi chi co ten nhan vat', () => {
  const { nameMap, forbiddenTerms } = buildNameContext({
    storyCharacters: [{ token: '{NV1}', name: 'Bin', childId: null }],
    children: [{ id: 'c1', name: 'Mai' }],
  });
  const out = tokenizeNames('Bin chạy nhanh', nameMap);
  assert.deepEqual(findLeftoverNames(out, forbiddenTerms), []);
});

// --- findDroppedTokens (bindCharacters, fix M1) ---
const { findDroppedTokens } = await import('../../src/modules/stories/lib/names.js');
const oldChars = [
  { token: '{NV1}', characterId: 'a', name: 'Bin' },
  { token: '{NV2}', characterId: 'b', name: 'Mít' },
  { token: '{NV3}', characterId: null, name: 'Bạn nhỏ' },
];

test('findDroppedTokens: token cua nhan vat bi bo trong chu -> tra ve', () => {
  const r = findDroppedTokens('{NV1} giận {NV2}.', oldChars, ['a']);
  assert.deepEqual(r, [{ token: '{NV2}', name: 'Mít' }]);
});

test('findDroppedTokens: nhan vat bi bo nhung khong xuat hien trong chu -> rong', () => {
  assert.deepEqual(findDroppedTokens('{NV1} đi học.', oldChars, ['a']), []);
});

test('findDroppedTokens: nhan vat giu lai (du doi vai) khong tinh la bo', () => {
  assert.deepEqual(findDroppedTokens('{NV1} và {NV2}', oldChars, ['b', 'a']), []);
});

test('findDroppedTokens: alias (khong characterId) luon tinh la bo; nhieu van ban, khong trung', () => {
  const r = findDroppedTokens(['{NV3} {NV3}', null, '{NV3}'], oldChars, ['a', 'b']);
  assert.deepEqual(r, [{ token: '{NV3}', name: 'Bạn nhỏ' }]);
});

test('findDroppedTokens: {NV1} khong khop nham {NV10}', () => {
  assert.deepEqual(findDroppedTokens('{NV10}', oldChars, []), []);
});
