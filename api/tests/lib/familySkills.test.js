import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorPageOrder, buildUsableCatalog, planFamilySlots, rankNeeds } from '../../src/modules/stories/lib/familySkills.js';
import { hashSituation, signAnalysisToken, verifyAnalysisToken } from '../../src/modules/stories/lib/analysisToken.js';

const v = (id, needsTarget = false) => ({ id, needsTarget });
const sub = (id, versions, extra = {}) => ({ id, isActive: true, ageMin: 5, ageMax: 8, templates: [{ answerFormat: 'emotion_pick', versions }], ...extra });

test('buildUsableCatalog: bo needsTarget khi khong co nhan vat phu, loc tuoi, loc rong thi bo loc tuoi', () => {
  const list = [sub('a', [v('a1', true)]), sub('b', [v('b1')]), sub('c', [v('c1')], { ageMin: 9, ageMax: 12 }), sub('d', [])];
  assert.deepEqual(buildUsableCatalog(list, { hasSecondary: false, ageRange: { ageMin: 6, ageMax: 6 } }).map((s) => s.id), ['b']);
  assert.deepEqual(buildUsableCatalog(list, { hasSecondary: true, ageRange: { ageMin: 6, ageMax: 6 } }).map((s) => s.id), ['a', 'b']);
  assert.deepEqual(buildUsableCatalog([list[2]], { hasSecondary: false, ageRange: { ageMin: 6, ageMax: 6 } }).map((s) => s.id), ['c']);
});

test('rankNeeds: emerging -> chua du du lieu -> developing -> secure, toi da 5', () => {
  const cat = ['s', 'd', 'n', 'e', 'x', 'y', 'z'].map((id) => ({ id }));
  const levels = new Map([['s', 'secure'], ['d', 'developing'], ['e', 'emerging'], ['x', 'secure'], ['y', 'secure'], ['z', 'secure']]);
  const out = rankNeeds(cat, levels, { rng: () => 0.5 }).map((s) => s.id);
  assert.deepEqual(out.slice(0, 3), ['e', 'n', 'd']);
  assert.equal(out.length, 5);
  assert.equal(rankNeeds(cat, null, { rng: () => 0 }).length, 5);
});

test('planFamilySlots: o thu hai luon la ky nang chinh, o con lai xoay vong tu ky nang chinh; ky nang chinh het mau -> 422', () => {
  const A = { id: 'A', versions: [v('a1')] };
  const B = { id: 'B', versions: [v('b1')] };
  assert.deepEqual(planFamilySlots({ slots: [2, 4, 5], subSkills: [A, B] }).map((p) => p.subSkillId), ['A', 'A', 'B']);
  assert.deepEqual(planFamilySlots({ slots: [2, 4, 6, 8], subSkills: [B, A] }).map((p) => p.subSkillId), ['B', 'B', 'A', 'B']);
  assert.deepEqual(planFamilySlots({ slots: [3], subSkills: [A, B] }).map((p) => p.subSkillId), ['A']);
  assert.deepEqual(planFamilySlots({ slots: [2, 4], subSkills: [A, { id: 'B', versions: [] }] }).map((p) => p.subSkillId), ['A', 'A']);
  assert.throws(() => planFamilySlots({ slots: [2], subSkills: [{ id: 'A', versions: [] }, B] }), (e) => e.statusCode === 422);
});

test('anchorPageOrder: diem dung cham thu hai, o cuoi neu 1 o, trang ap cuoi neu khong cham', () => {
  const pages = [1, 2, 3, 4, 5, 6, 7, 8].map((pageOrder) => ({ pageOrder }));
  const cp = (type, afterPageOrder) => ({ type, afterPageOrder });
  assert.equal(anchorPageOrder(pages, [cp('reflection', 8), cp('emotion_self', 2), cp('perspective', 4), cp('problem_solving', 5)]), 4);
  assert.equal(anchorPageOrder(pages, [cp('emotion_self', 3), cp('reflection', 8)]), 3);
  assert.equal(anchorPageOrder(pages, [cp('reflection', 8)]), 7);
});

test('analysisToken: ky / xac minh, het han, sai chu, sua payload', () => {
  const now = new Date('2026-10-22T00:00:00Z');
  const p = { ownerId: 'u1', situationHash: hashSituation('{NV1} giận'), characters: [{ characterId: 'c1', isMain: true }], momentSummary: '{NV1} giận', seedEvent: null, subSkills: [{ id: 's1', source: 'moment' }] };
  const { token, expiresAt } = signAnalysisToken(p, 'secret', { now });
  assert.equal(expiresAt.getTime() - now.getTime(), 2 * 3600 * 1000);
  const ok = verifyAnalysisToken(token, 'secret', { ownerId: 'u1', now });
  assert.equal(ok.momentSummary, '{NV1} giận');
  assert.deepEqual(ok.subSkills, [{ id: 's1', source: 'moment' }]);
  assert.equal(verifyAnalysisToken(token, 'secret', { ownerId: 'u2', now }), null);
  assert.equal(verifyAnalysisToken(token, 'other', { ownerId: 'u1', now }), null);
  assert.equal(verifyAnalysisToken(token, 'secret', { ownerId: 'u1', now: new Date(now.getTime() + 3 * 3600 * 1000) }), null);
  const [body, sig] = token.split('.');
  const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), own: 'u2' })).toString('base64url');
  assert.equal(verifyAnalysisToken(`${tampered}.${sig}`, 'secret', { ownerId: 'u2', now }), null);
});
