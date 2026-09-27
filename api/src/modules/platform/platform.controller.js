import platformService from './platform.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const getSettings = catchAsync(async (req, res) => {
  const settings = await platformService.getSettings(req.user.id);
  ApiResponse.success(res, settings, 'Lấy danh sách cấu hình nền tảng thành công');
});

const getSettingByKey = catchAsync(async (req, res) => {
  const setting = await platformService.getSettingByKey(req.params.key);
  ApiResponse.success(res, setting, 'Lấy chi tiết cấu hình nền tảng thành công');
});

const updateSetting = catchAsync(async (req, res) => {
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const updated = await platformService.updateSetting(req.user, req.params.key, req.body.value, ipAddress);
  ApiResponse.success(res, updated, 'Cập nhật cấu hình nền tảng thành công');
});

const getAuditLogs = catchAsync(async (req, res) => {
  const logs = await platformService.getAuditLogs(req.query);
  ApiResponse.success(res, logs, 'Lấy nhật ký kiểm toán quản trị thành công');
});

export default {
  getSettings,
  getSettingByKey,
  updateSetting,
  getAuditLogs,
};
