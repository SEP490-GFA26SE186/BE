import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelFor, buildEqLevels, LEVEL_ORDER } from '../../src/modules/children/lib/eqLevels.js';
import { DEFAULT_REPORT_SETTINGS } from '../../src/modules/pedagogy-settings/lib/reportSettings.js';

const S = DEFAULT_REPORT_SETTINGS; // window 5, min 3, developing 0.5, secure 0.8

test('levelFor: [1,1,0] du 3 cau -> developing (0.67); [1,1] -> null', () => {
  assert.equal(levelFor([1, 1, 0], S), 'developing');
  assert.equal(levelFor([1, 1], S), null);
  assert.equal(levelFor([], S), null);
});

test('levelFor: nguong < developingFrom emerging, < secureFrom developing, con lai secure', () => {
  assert.equal(levelFor([0, 0, 1], S), 'emerging'); // 0.33
  assert.equal(levelFor([1, 0, 1, 0], S), 'developing'); // 0.5 dung nguong
  assert.equal(levelFor([1, 1, 1, 1, 0], S), 'secure'); // 0.8 dung nguong
  assert.equal(levelFor([0.25, 0.25, 0.25], S), 'emerging');
});

test('levelFor: window 5 lay 5 diem moi nhat (diem cu thap khong keo muc)', () => {
  // moi -> cu: 5 cau dung gan day, 3 cau sai cu
  assert.equal(levelFor([1, 1, 1, 1, 1, 0, 0, 0], S), 'secure');
  assert.equal(levelFor([1, 1, 1], { ...S, window: 3, minItems: 3 }), 'secure');
  assert.equal(levelFor([0, 1, 1, 1], { ...S, window: 1, minItems: 1 }), 'emerging');
});

const skills = [
  { id: 'k2', caselCode: 'self_management', nameVi: 'Tự quản lý', displayOrder: 2 },
  { id: 'k1', caselCode: 'self_awareness', nameVi: 'Tự nhận thức', displayOrder: 1 },
];
const subSkills = [
  { id: 'a', skillId: 'k1', nameVi: 'Gọi tên cảm xúc', displayOrder: 1, caselReference: { textEn: 'Identify emotions' } },
  { id: 'b', skillId: 'k1', nameVi: 'Nhận ra điểm mạnh', displayOrder: 2, caselReference: { textEn: 'Recognize strengths' } },
  { id: 'c', skillId: 'k2', nameVi: 'Bình tĩnh', displayOrder: 1, caselReference: { textEn: 'Manage emotions' } },
];
const at = (i) => new Date(Date.UTC(2026, 9, 20) - i * 60_000);
const rows = (subSkillId, scores) => scores.map((score, i) => ({ subSkillId, score, answeredAt: at(i) }));

test('buildEqLevels: nang luc = muc thap nhat cua ky nang con co muc; secure + emerging -> emerging', () => {
  const r = buildEqLevels([...rows('a', [1, 1, 1]), ...rows('b', [0, 0, 0])], skills, subSkills, S);
  assert.deepEqual(r.competencies.map((c) => c.caselCode), ['self_awareness', 'self_management']);
  const sa = r.competencies[0];
  assert.equal(sa.level, 'emerging');
  assert.deepEqual(sa.subSkills, [
    { id: 'a', nameVi: 'Gọi tên cảm xúc', caselTextEn: 'Identify emotions', level: 'secure', items: 3 },
    { id: 'b', nameVi: 'Nhận ra điểm mạnh', caselTextEn: 'Recognize strengths', level: 'emerging', items: 3 },
  ]);
  assert.equal(r.competencies[1].level, null, 'khong ky nang con nao co muc -> null');
  assert.equal(r.competencies[1].subSkills[0].items, 0);
});

test('buildEqLevels: ky nang con chua du cau khong keo muc nang luc; dong la (ky nang con khong biet) bo qua', () => {
  const r = buildEqLevels([...rows('a', [1, 1, 1, 1]), ...rows('b', [0]), ...rows('zzz', [0, 0, 0])], skills, subSkills, S);
  assert.equal(r.competencies[0].level, 'secure');
  assert.equal(r.competencies[0].subSkills[1].level, null);
  assert.equal(r.competencies[0].subSkills[1].items, 1);
});

test('buildEqLevels: items la so cau trong cua so (toi da window)', () => {
  const r = buildEqLevels(rows('a', [1, 1, 1, 1, 1, 1, 1]), skills, subSkills, S);
  assert.equal(r.competencies[0].subSkills[0].items, 5);
  assert.deepEqual(LEVEL_ORDER, ['emerging', 'developing', 'secure']);
});

test('levelFor: lam tron, khong mat nguong 0.8 / 0.5 do sai so dau phay dong', () => {
  // Trung binh that = 0.8 nhung (0.6 + 1 + 0.8) / 3 = 0.8000000000000002 (va (0.7+0.8+0.9)/3 = 0.7999999999999999)
  assert.equal(levelFor([0.6, 1, 0.8], S), 'secure');
  assert.equal(levelFor([0.7, 0.8, 0.9], S), 'secure'); // truoc day rot xuong developing
  assert.equal(levelFor([0.5, 0.5, 0.5], S), 'developing');
  assert.equal(levelFor([0.3, 0.7, 0.5], S), 'developing');
  assert.equal(levelFor([0.75, 0.8, 0.85], S), 'secure'); // 0.8 dung nguong
  assert.equal(levelFor([0.75, 0.8, 0.84], S), 'developing'); // 0.7967
});
