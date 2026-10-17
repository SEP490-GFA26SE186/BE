// Gia sach cua mot be (rev8): tien do doc, trang thai, loc, dem, phan trang. Ham thuan, khong DB.
// Gia sach mot be chi vai chuc truyen -> tinh trong bo nho, khop hanh vi Web childService.getChildBookshelf.

/** `session`: lan choi gan nhat { status, currentPageOrder, lastActivityAt } hoac null. */
export function readingProgress(session, totalPages) {
  if (!session) return null;
  const isCompleted = session.status === 'completed';
  const currentPageOrder = isCompleted ? totalPages : session.currentPageOrder ?? 0;
  const progressPercentage =
    isCompleted ? 100 : totalPages > 0 ? Math.round((currentPageOrder / totalPages) * 100) : 0;
  return { isCompleted, currentPageOrder, progressPercentage, lastActivityAt: session.lastActivityAt };
}

export const readingStatus = (item) =>
  !item.readingProgress ? 'not_started' : item.readingProgress.isCompleted ? 'completed' : 'reading';

const fold = (s) => String(s ?? '').normalize('NFC').toLocaleLowerCase('vi');

const byLastActivityDesc = (a, b) =>
  new Date(b.readingProgress.lastActivityAt) - new Date(a.readingProgress.lastActivityAt);

/**
 * items: da dinh dang { storyId, title, topic{title, competency}, readingProgress, ... }, thu tu them vao gia.
 * Dem `counts` sau khi loc tu khoa + nang luc (truoc khi loc trang thai), giong tab tren Web.
 */
export function buildShelf(items, { search, status = 'all', competency = 'all', page = 1, limit = 10 } = {}) {
  const keyword = fold(search).trim();
  const matched = items.filter(
    (i) =>
      (!keyword || fold(`${i.title} ${i.topic?.title ?? ''}`).includes(keyword)) &&
      (competency === 'all' || i.topic?.competency === competency),
  );
  const filtered = matched.filter((i) => status === 'all' || readingStatus(i) === status);
  const countOf = (s) => matched.filter((i) => readingStatus(i) === s).length;
  return {
    items: filtered.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / limit)) },
    counts: {
      all: matched.length,
      reading: countOf('reading'),
      completed: countOf('completed'),
      not_started: countOf('not_started'),
    },
    continueReading: items.filter((i) => readingStatus(i) === 'reading').sort(byLastActivityDesc),
  };
}
