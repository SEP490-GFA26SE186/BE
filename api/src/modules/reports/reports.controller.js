import reportsService from './reports.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const getChildEqReport = catchAsync(async (req, res) => {
  const result = await reportsService.getChildEqReport(req.user.id, req.params.childId, req.query);
  ApiResponse.success(res, result, 'Lấy báo cáo phân tích EQ của bé thành công');
});

const getPlatformOverview = catchAsync(async (_req, res) => {
  const result = await reportsService.getPlatformSupervisionOverview();
  ApiResponse.success(res, result, 'Lấy tổng quan giám sát nền tảng thành công');
});

export default {
  getChildEqReport,
  getPlatformOverview,
};
