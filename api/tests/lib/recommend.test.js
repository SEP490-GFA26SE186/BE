import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendTopics } from '../../src/modules/children/lib/recommend.js';

const levels = {
  competencies: [
    { caselCode: 'self_awareness', nameVi: 'Tự nhận thức', level: 'emerging', subSkills: [{ id: 'a', level: 'emerging' }, { id: 'b', level: 'secure' }] },
    { caselCode: 'self_management', nameVi: 'Tự quản lý', level: null, subSkills: [{ id: 'c', level: null }] },
    { caselCode: 'social_awareness', nameVi: 'Nhận thức xã hội', level: 'developing', subSkills: [{ id: 'd', level: 'developing' }] },
    { caselCode: 'relationship_skills', nameVi: 'Kỹ năng quan hệ', level: 'secure', subSkills: [{ id: 'e', level: 'secure' }] },
  ],
};
const topic = (id, caselCode, subIds, extra = {}) => ({
  id, title: `Topic ${id}`, isActive: true, ageMin: 5, ageMax: 8, displayOrder: 0,
  skill: { caselCode, nameVi: caselCode }, subSkills: subIds.map((sid) => ({ id: sid, nameVi: `Kỹ năng ${sid}` })), ...extra,
});

test('recommendTopics: nang luc chua co du lieu xep truoc ky nang con emerging, roi developing', () => {
  const topics = [
    topic('t-dev', 'social_awareness', ['d']),
    topic('t-sec', 'relationship_skills', ['e']),
    topic('t-emg', 'self_awareness', ['a']),
    topic('t-null', 'self_management', ['c']),
  ];
  const out = recommendTopics({ levels, topics, childAge: 6, recentTopicIds: [] });
  assert.deepEqual(out.map((t) => t.id), ['t-null', 't-emg', 't-dev']);
  assert.deepEqual(out[0], {
    id: 't-null', title: 'Topic t-null', skill: { caselCode: 'self_management', nameVi: 'self_management' },
    subSkills: [{ id: 'c', nameVi: 'Kỹ năng c' }],
  });
});

test('recommendTopics: topic vua doc bi loai; hoa theo displayOrder; limit', () => {
  const topics = [
    topic('t1', 'self_management', ['c'], { displayOrder: 3 }),
    topic('t2', 'self_management', ['c'], { displayOrder: 1 }),
    topic('t3', 'self_management', ['c'], { displayOrder: 2 }),
  ];
  assert.deepEqual(recommendTopics({ levels, topics, childAge: 6, recentTopicIds: ['t2'] }).map((t) => t.id), ['t3', 't1']);
  assert.deepEqual(recommendTopics({ levels, topics, childAge: 6, recentTopicIds: [], limit: 1 }).map((t) => t.id), ['t2']);
});

test('recommendTopics: topic ngoai tuoi / dang tat bi loai; tuoi null -> bo loc tuoi', () => {
  const topics = [
    topic('old', 'self_management', ['c'], { ageMin: 9, ageMax: 12 }),
    topic('off', 'self_management', ['c'], { isActive: false }),
    topic('ok', 'self_awareness', ['b']),
  ];
  assert.deepEqual(recommendTopics({ levels, topics, childAge: 6, recentTopicIds: [] }).map((t) => t.id), ['ok']);
  assert.deepEqual(recommendTopics({ levels, topics, childAge: null, recentTopicIds: [] }).map((t) => t.id), ['old', 'ok']);
});

test('recommendTopics: ky nang con chua du du lieu (nang luc da co muc) uu tien ngang emerging; secure xep cuoi', () => {
  const lv = {
    competencies: [
      { caselCode: 'self_awareness', level: 'secure', subSkills: [{ id: 'a', level: 'secure' }, { id: 'b', level: null }] },
      { caselCode: 'social_awareness', level: 'developing', subSkills: [{ id: 'd', level: 'developing' }] },
    ],
  };
  const topics = [topic('sec', 'self_awareness', ['a']), topic('dev', 'social_awareness', ['d']), topic('nodata', 'self_awareness', ['b'])];
  assert.deepEqual(recommendTopics({ levels: lv, topics, childAge: 6, recentTopicIds: [] }).map((t) => t.id), ['nodata', 'dev', 'sec']);
});
