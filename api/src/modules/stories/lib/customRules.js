import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../utils/ApiError.js';

const fail = (message) => new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, message);

/**
 * Luat truyen `custom`: so trang trong [minPages, maxPages]; toi da maxCheckpoints diem dung;
 * moi trang toi da 1 diem dung; khong dat sau trang 1; `reflection` chi o trang cuoi.
 */
export function assertCustomLayout({ pageCount, checkpoints }, { minPages, maxPages, maxCheckpoints }) {
  if (pageCount < minPages || pageCount > maxPages) {
    throw fail(`Truyện tự viết phải có từ ${minPages} đến ${maxPages} trang.`);
  }
  if (checkpoints.length > maxCheckpoints) {
    throw fail(`Truyện tự viết chỉ được có tối đa ${maxCheckpoints} điểm dừng.`);
  }

  const used = new Set();
  for (const cp of checkpoints) {
    const at = cp.afterPageOrder;
    if (at < 2) throw fail('Không thể đặt điểm dừng sau trang 1.');
    if (at > pageCount) throw fail('Điểm dừng phải đặt sau một trang có trong truyện.');
    if (used.has(at)) throw fail('Mỗi trang chỉ được có tối đa một điểm dừng.');
    used.add(at);
    if (cp.type === 'reflection' && at !== pageCount) {
      throw fail('Điểm dừng tổng kết (reflection) chỉ được đặt sau trang cuối.');
    }
  }
}
