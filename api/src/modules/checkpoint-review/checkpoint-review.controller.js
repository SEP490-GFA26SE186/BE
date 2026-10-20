import { ApiResponse, catchAsync } from '../../utils/index.js';
import service from './checkpoint-review.service.js';

const list = catchAsync(async (req, res) => {
  const { items, nextCursor } = await service.listQueue(req.query);
  return res.status(200).json({ success: true, message: 'Success', data: items, nextCursor });
});
const stats = catchAsync(async (_req, res) => ApiResponse.success(res, { data: await service.stats() }));
const markOk = catchAsync(async (req, res) =>
  ApiResponse.success(res, { message: 'Đã đánh dấu ổn', data: await service.markOk(req.user, req.params.checkpointId) }),
);
const flag = catchAsync(async (req, res) =>
  ApiResponse.success(res, { message: 'Đã loại khỏi điểm', data: await service.flag(req.user, req.params.checkpointId, req.body.reason) }),
);
const unflag = catchAsync(async (req, res) =>
  ApiResponse.success(res, { message: 'Đã gỡ cờ', data: await service.unflag(req.params.checkpointId) }),
);

export default { list, stats, markOk, flag, unflag };
