import test from 'node:test';
import assert from 'node:assert/strict';

const v = (await import('../../src/modules/stories/stories.validation.js')).default;

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TOPIC = '33333333-3333-4333-8333-333333333333';

const body = (over = {}) => ({
  topicId: TOPIC,
  length: 'medium',
  title: 'Bin và Mít',
  characters: [{ characterId: A, isMain: true }, { characterId: B, isMain: false }],
  ...over,
});
const create = (b) => v.createStory.safeParse({ body: b });
const paths = (r) => r.error.issues.map((i) => i.path.join('.'));

test('createStory: body hop le, gia tri mac dinh cho co', () => {
  const r = create(body());
  assert.equal(r.success, true);
  assert.equal(r.data.body.useAiImage, false);
  assert.equal(r.data.body.useTts, true);
});

test('createStory: length chi nhan short|medium|long|custom', () => {
  for (const length of ['short', 'medium', 'long', 'custom']) assert.equal(create(body({ length })).success, true);
  assert.equal(create(body({ length: 'huge' })).success, false);
});

test('createStory: phai co dung mot isMain', () => {
  const none = create(body({ characters: [{ characterId: A, isMain: false }] }));
  assert.equal(none.success, false);
  assert.ok(paths(none).includes('body.characters'));
  const two = create(body({ characters: [{ characterId: A, isMain: true }, { characterId: B, isMain: true }] }));
  assert.equal(two.success, false);
});

test('createStory: tu choi characterId trung', () => {
  const r = create(body({ characters: [{ characterId: A, isMain: true }, { characterId: A, isMain: false }] }));
  assert.equal(r.success, false);
  assert.ok(paths(r).includes('body.characters'));
});

test('createStory: can it nhat mot nhan vat, id phai la uuid', () => {
  assert.equal(create(body({ characters: [] })).success, false);
  assert.equal(create(body({ characters: [{ characterId: 'x', isMain: true }] })).success, false);
  assert.equal(create(body({ topicId: 'x' })).success, false);
});

test('createStory: title bat buoc, situation tuy chon', () => {
  assert.equal(create(body({ title: '  ' })).success, false);
  assert.equal(create(body({ situation: 'Bin giận Mít' })).success, true);
});

test('getStories: page/limit ep so, mac dinh 1/10, loc status', () => {
  const r = v.getStories.safeParse({ query: {} });
  assert.equal(r.success, true);
  assert.deepEqual(r.data.query, { page: 1, limit: 10 });
  const r2 = v.getStories.safeParse({ query: { page: '2', limit: '5', status: 'ready' } });
  assert.deepEqual(r2.data.query, { page: 2, limit: 5, status: 'ready' });
  assert.equal(v.getStories.safeParse({ query: { status: 'x' } }).success, false);
});

test('updateStory: can it nhat mot truong', () => {
  const params = { id: A };
  assert.equal(v.updateStory.safeParse({ params, body: {} }).success, false);
  assert.equal(v.updateStory.safeParse({ params, body: { title: 'Mới' } }).success, true);
  assert.equal(v.updateStory.safeParse({ params, body: { situation: null } }).success, true);
  assert.equal(v.updateStory.safeParse({ params: { id: 'x' }, body: { title: 'Mới' } }).success, false);
});

test('bindCharacters: cung luat nhan vat nhu khi tao', () => {
  const params = { id: A };
  const ok = v.bindCharacters.safeParse({ params, body: { characters: [{ characterId: A, isMain: true }] } });
  assert.equal(ok.success, true);
  const dup = v.bindCharacters.safeParse({
    params,
    body: { characters: [{ characterId: A, isMain: true }, { characterId: A, isMain: false }] },
  });
  assert.equal(dup.success, false);
});
