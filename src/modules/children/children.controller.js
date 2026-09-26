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

const updateChildAvatar = catchAsync(async (req, res) => {
  const avatar = await childrenService.updateChildAvatar(req.user.id, req.params.id, req.body);

  return ApiResponse.success(res, {
    message: 'Cập nhật ảnh đại diện của bé thành công',
    data: { avatar },
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

const getChildOverview = catchAsync(async (req, res) => {
  const overview = await childrenService.getChildOverview(req.user.id, req.params.id);

  return ApiResponse.success(res, {
    message: 'Lấy tổng quan bảng điều khiển của bé thành công',
    data: overview,
  });
});

const getChildEqReport = catchAsync(async (req, res) => {
  const report = await childrenService.getChildEqReport(req.user.id, req.params.id, req.query);

  return ApiResponse.success(res, {
    message: 'Lấy báo cáo chỉ số cảm xúc EQ của bé thành công',
    data: report,
  });
});

const getChildBookshelf = catchAsync(async (req, res) => {
  const bookshelf = await childrenService.getChildBookshelf(req.user, req.params.id, req.query);

  return ApiResponse.success(res, {
    data: bookshelf,
  });
});

export default {
  createChild,
  getChildren,
  getChildById,
  updateChild,
  deleteChild,
  updateChildAvatar,
  getChildUsage,
  logUsageSession,
  getChildOverview,
  getChildEqReport,
  getChildBookshelf,
};
