import { ApiResponse, catchAsync } from '../../utils/index.js';
import service from './pedagogy-settings.service.js';

const getReportSettings = catchAsync(async (_req, res) => ApiResponse.success(res, { data: await service.getReportSettings() }));
const updateReportSettings = catchAsync(async (req, res) =>
  ApiResponse.success(res, { message: 'Đã lưu tham số báo cáo EQ', data: await service.updateReportSettings(req.user, req.body) }),
);

export default { getReportSettings, updateReportSettings };
