import test from 'node:test';
import assert from 'node:assert/strict';

const { planSlots } = await import('../../src/modules/stories/lib/slotPlan.js');

const v = (id, answerFormat, needsTarget = false) => ({ id, answerFormat, needsTarget });
const A = { id: 'A', displayOrder: 1, versions: [v('a1', 'emotion_pick'), v('a2', 'single_correct', true)] };
const B = { id: 'B', displayOrder: 2, versions: [v('b1', 'role_choice')] };
const fixed = (x) => () => x;

test('planSlots: 3 o + 2 ky nang con -> A, B, A theo thu tu o', () => {
  const plan = planSlots({ slots: [2, 4, 5], subSkills: [A, B], hasSecondary: true, rng: fixed(0) });
  assert.deepEqual(plan.map((p) => p.subSkillId), ['A', 'B', 'A']);
  assert.deepEqual(plan.map((p) => p.afterPageOrder), [2, 4, 5]);
  assert.equal(plan[1].templateVersion.id, 'b1');
});

test('planSlots: rng chon phien ban trong ky nang con, co dinh -> lap lai duoc', () => {
  const run = () => planSlots({ slots: [2, 4, 5], subSkills: [A, B], hasSecondary: true, rng: fixed(0.99) });
  assert.deepEqual(run().map((p) => p.templateVersion.id), ['a2', 'b1', 'a2']);
  assert.deepEqual(run(), run());
});

test('planSlots: khong co nhan vat phu -> loai phien ban needsTarget', () => {
  const plan = planSlots({ slots: [2, 4, 5], subSkills: [A, B], hasSecondary: false, rng: fixed(0.99) });
  assert.deepEqual(plan.map((p) => p.templateVersion.id), ['a1', 'b1', 'a1']);
});

test('planSlots: ky nang con het phien ban dung duoc -> bo qua sang ky nang con ke', () => {
  const C = { id: 'C', displayOrder: 0, versions: [v('c1', 'single_correct', true)] };
  const plan = planSlots({ slots: [2, 4], subSkills: [C, B], hasSecondary: false, rng: fixed(0) });
  assert.deepEqual(plan.map((p) => p.subSkillId), ['B', 'B']);
});

test('planSlots: moi phien ban can target ma khong co nhan vat phu -> 422 "nhan vat phu"', () => {
  const C = { id: 'C', displayOrder: 0, versions: [v('c1', 'single_correct', true)] };
  assert.throws(
    () => planSlots({ slots: [2], subSkills: [C], hasSecondary: false, rng: fixed(0) }),
    (e) => e.statusCode === 422 && /nhân vật phụ/.test(e.message),
  );
});

test('planSlots: khong co ky nang con / phien ban -> 422 "mau cau hoi"', () => {
  for (const subSkills of [[], [{ id: 'D', displayOrder: 0, versions: [] }]]) {
    assert.throws(
      () => planSlots({ slots: [2], subSkills, hasSecondary: true, rng: fixed(0) }),
      (e) => e.statusCode === 422 && /mẫu câu hỏi/.test(e.message),
    );
  }
});

test('planSlots: khong co o cham -> mang rong, khong nem', () => {
  assert.deepEqual(planSlots({ slots: [], subSkills: [], hasSecondary: false, rng: fixed(0) }), []);
});
