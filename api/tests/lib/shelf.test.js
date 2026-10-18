import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShelf, readingProgress } from '../../src/modules/bookshelf/lib/shelf.js';

const item = (storyId, title, competency, totalPages, session = null, topicTitle = 'Chủ đề') => ({
  storyId, title, kind: 'private', length: 'medium', totalPages, useTts: true, useAiImage: false,
  topic: { title: topicTitle, competency }, addedAt: new Date('2026-10-01T00:00:00Z'),
  readingProgress: readingProgress(session, totalPages),
});
const at = (d) => new Date(`2026-10-${d}T12:00:00Z`);

test('readingProgress: chua doc / dang doc / doc xong', () => {
  assert.equal(readingProgress(null, 8), null);
  assert.deepEqual(readingProgress({ status: 'in_progress', currentPageOrder: 2, lastActivityAt: at(10) }, 8), {
    isCompleted: false, currentPageOrder: 2, progressPercentage: 25, lastActivityAt: at(10),
  });
  assert.deepEqual(readingProgress({ status: 'completed', currentPageOrder: 5, lastActivityAt: at(11) }, 8), {
    isCompleted: true, currentPageOrder: 8, progressPercentage: 100, lastActivityAt: at(11),
  });
  // khong co trang hien tai (vua mo) -> 0%
  assert.equal(readingProgress({ status: 'in_progress', currentPageOrder: null, lastActivityAt: at(9) }, 8).progressPercentage, 0);
});

const shelf = [
  item('a', 'Khủng long giận', 'self_management', 8, { status: 'in_progress', currentPageOrder: 4, lastActivityAt: at(12) }),
  item('b', 'Chia sẻ kẹo', 'relationship_skills', 6, { status: 'completed', currentPageOrder: 6, lastActivityAt: at(5) }),
  item('c', 'Đom đóm', 'self_awareness', 10),
  item('d', 'Cá heo', 'self_management', 6, { status: 'in_progress', currentPageOrder: 1, lastActivityAt: at(14) }),
];

test('buildShelf: dem theo trang thai sau khi loc tu khoa / nang luc; tiep tuc doc moi nhat truoc', () => {
  const out = buildShelf(shelf, { page: 1, limit: 10 });
  assert.deepEqual(out.counts, { all: 4, reading: 2, completed: 1, not_started: 1 });
  assert.deepEqual(out.continueReading.map((i) => i.storyId), ['d', 'a']);
  assert.deepEqual(out.pagination, { page: 1, limit: 10, total: 4, totalPages: 1 });

  const mgmt = buildShelf(shelf, { competency: 'self_management', status: 'reading', page: 1, limit: 10 });
  assert.deepEqual(mgmt.items.map((i) => i.storyId), ['a', 'd']);
  assert.deepEqual(mgmt.counts, { all: 2, reading: 2, completed: 0, not_started: 0 });
  // tiep tuc doc khong phu thuoc bo loc / tab
  assert.deepEqual(mgmt.continueReading.map((i) => i.storyId), ['d', 'a']);
});

test('buildShelf: tim khong phan biet hoa thuong va dau Unicode tren ten truyen + chu de', () => {
  const out = buildShelf(shelf, { search: 'KHỦNG', page: 1, limit: 10 });
  assert.deepEqual(out.items.map((i) => i.storyId), ['a']);
  const byTopic = buildShelf([item('x', 'Truyện', 'self_awareness', 6, null, 'Con sợ bóng tối')], { search: 'bóng tối', page: 1, limit: 10 });
  assert.equal(byTopic.items.length, 1);
});

test('buildShelf: phan trang, trang trong van co totalPages >= 1', () => {
  const p2 = buildShelf(shelf, { page: 2, limit: 3 });
  assert.deepEqual(p2.items.map((i) => i.storyId), ['d']);
  assert.deepEqual(p2.pagination, { page: 2, limit: 3, total: 4, totalPages: 2 });
  const empty = buildShelf([], { page: 1, limit: 10 });
  assert.deepEqual(empty.pagination, { page: 1, limit: 10, total: 0, totalPages: 1 });
});
