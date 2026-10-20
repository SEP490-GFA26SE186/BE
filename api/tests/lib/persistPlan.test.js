import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { planPersist } = await import('../../src/modules/stories/lib/persistPlan.js');
const { AiServiceError } = await import('../../src/clients/aiClient.js');

const response = () =>
  JSON.parse(
    readFileSync(new URL('../../../ai/docs/samples/story_response.json', import.meta.url), 'utf8'),
  );

const rows = () => ({
  pages: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `pg${n}`, pageOrder: n })),
  checkpoints: [
    { id: 'c1', type: 'emotion_self', afterPageOrder: 2 },
    { id: 'c2', type: 'perspective', afterPageOrder: 4 },
    { id: 'c3', type: 'problem_solving', afterPageOrder: 5 },
    { id: 'c4', type: 'reflection', afterPageOrder: 8 },
  ],
});

test('planPersist: canh theo thu tu trang dau tien dung canh do', () => {
  const plan = planPersist(response(), rows());
  assert.deepEqual(plan.scenes.map((s) => [s.key, s.sceneOrder]), [['s1', 1], ['s2', 2], ['s3', 3]]);
  assert.equal(plan.scenes[0].description, response().scenes.s1);
});

test('planPersist: canh khong trang nao dung bi bo, thu tu theo trang', () => {
  const r = response();
  r.scenes.s0 = 'khong dung';
  r.pages.p1.scene = 's2';
  r.pages.p5.scene = 's1';
  const plan = planPersist(r, rows());
  assert.deepEqual(plan.scenes.map((s) => [s.key, s.sceneOrder]), [['s2', 1], ['s1', 2], ['s3', 3]]);
});

test('planPersist: p3 -> trang pageOrder 3', () => {
  const plan = planPersist(response(), rows());
  const page = plan.pages[2];
  assert.equal(page.id, 'pg3');
  assert.equal(page.contentText, response().pages.p3.text);
  assert.equal(page.sceneKey, 's1');
});

test('planPersist: k1 emotion_self co answerEmotion va hint', () => {
  const [k1] = planPersist(response(), rows()).checkpoints;
  assert.equal(k1.id, 'c1');
  assert.equal(k1.answerEmotion, 'angry');
  assert.equal(k1.hint, 'Mặt {NV1} nóng bừng, hai tay nắm chặt kìa.');
  assert.deepEqual(k1.options, []);
});

test('planPersist: k2 perspective 3 phuong an, dung mot isCorrect', () => {
  const k2 = planPersist(response(), rows()).checkpoints[1];
  assert.equal(k2.options.length, 3);
  assert.deepEqual(k2.options.map((o) => o.isCorrect), [true, false, false]);
  assert.ok(k2.options.every((o) => o.role === null));
  assert.deepEqual(k2.options.map((o) => o.optionOrder), [1, 2, 3]);
  assert.equal(k2.answerEmotion, null);
});

test('planPersist: k3 problem_solving co role + feedback, isCorrect/hint null', () => {
  const k3 = planPersist(response(), rows()).checkpoints[2];
  assert.deepEqual(k3.options.map((o) => o.role), ['constructive', 'avoidant', 'impulsive']);
  assert.ok(k3.options.every((o) => o.isCorrect === null && o.feedback));
  assert.equal(k3.hint, null);
});

test('planPersist: k4 reflection khong phuong an', () => {
  const k4 = planPersist(response(), rows()).checkpoints[3];
  assert.deepEqual(k4.options, []);
  assert.equal(k4.hint, null);
});

test('planPersist: thieu page_id hoac checkpoint -> OUTPUT_INVALID khong retryable', () => {
  const r1 = response();
  delete r1.pages.p4;
  const r2 = response();
  delete r2.checkpoints.k3;
  for (const r of [r1, r2]) {
    assert.throws(
      () => planPersist(r, rows()),
      (e) => e instanceof AiServiceError && e.code === 'OUTPUT_INVALID' && e.retryable === false,
    );
  }
});

test('planPersist: diem dung cam xuc thieu/sai answer -> OUTPUT_INVALID (khong de DB CHECK nem INTERNAL)', () => {
  const r1 = response();
  delete r1.checkpoints.k1.answer;
  const r2 = response();
  r2.checkpoints.k1.answer = 'furious';
  for (const r of [r1, r2]) {
    assert.throws(
      () => planPersist(r, rows()),
      (e) => e instanceof AiServiceError && e.code === 'OUTPUT_INVALID' && e.retryable === false,
    );
  }
});

test('planPersist: cam xuc ngoai allowedEmotions cua mau -> OUTPUT_INVALID', () => {
  const r = rows();
  r.checkpoints[0].allowedEmotions = ['happy', 'sad'];
  const resp = response();
  const k1 = Object.values(resp.checkpoints).find((c) => c.type === 'emotion_self');
  k1.answer = 'angry';
  assert.throws(() => planPersist(resp, r), (e) => e instanceof AiServiceError && e.code === 'OUTPUT_INVALID');
  k1.answer = 'sad';
  assert.doesNotThrow(() => planPersist(resp, r));
});
