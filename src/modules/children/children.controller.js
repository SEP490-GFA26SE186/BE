import childrenService from './children.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const createChild = catchAsync(async (req, res) => {
  const child = await childrenService.createChild(req.user.id, req.body);

  return ApiResponse.created(res, {
    message: 'Tạo hồ sơ bé thành công',
    data: { child },
  });
});

const getChildren = catchAsync(async (req, res) => {
  const children = await childrenService.getChildren(req.user.id);

  return ApiResponse.success(res, {
    data: { children },
  });
});

const getChildById = catchAsync(async (req, res) => {
  const child = await childrenService.getChildById(req.user.id, req.params.id);

  return ApiResponse.success(res, {
    data: { child },
  });
});

const updateChild = catchAsync(async (req, res) => {
  const child = await childrenService.updateChild(req.user.id, req.params.id, req.body);

  return ApiResponse.success(res, {
    message: 'Cập nhật hồ sơ bé thành công',
    data: { child },
  });
});

const deleteChild = catchAsync(async (req, res) => {
  const result = await childrenService.deleteChild(req.user.id, req.params.id);

  return ApiResponse.success(res, {
    message: result.message,
  });
});

const getChildUsage = catchAsync(async (req, res) => {
  const usage = await childrenService.getChildUsage(req.user.id, req.params.id, req.query.date);

  return ApiResponse.success(res, {
    data: usage,
  });
});

const logUsageSession = catchAsync(async (req, res) => {
  const session = await childrenService.logUsageSession(req.user.id, req.params.id, req.body);

  return ApiResponse.created(res, {
    message: 'Ghi nhận thời lượng sử dụng thành công',
    data: { session },
  });
});

export default {
  createChild,
  getChildren,
  getChildById,
  updateChild,
  deleteChild,
  getChildUsage,
  logUsageSession,
};
