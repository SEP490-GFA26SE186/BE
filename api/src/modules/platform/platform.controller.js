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

// User Management
const getUsers = catchAsync(async (req, res) => {
  const result = await platformService.getUsers(req.query);
  ApiResponse.success(res, result, 'Lấy danh sách người dùng thành công');
});

const getUserById = catchAsync(async (req, res) => {
  const user = await platformService.getUserById(req.params.id);
  ApiResponse.success(res, user, 'Lấy chi tiết người dùng thành công');
});

const updateUserRole = catchAsync(async (req, res) => {
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const updated = await platformService.updateUserRole(req.user, req.params.id, req.body.role, ipAddress);
  ApiResponse.success(res, updated, 'Cập nhật vai trò người dùng thành công');
});

const updateUserStatus = catchAsync(async (req, res) => {
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const updated = await platformService.updateUserStatus(req.user, req.params.id, req.body.isActive, ipAddress);
  ApiResponse.success(res, updated, 'Cập nhật trạng thái hoạt động người dùng thành công');
});

// Voucher Management
const getVouchers = catchAsync(async (req, res) => {
  const result = await platformService.getVouchers(req.query);
  ApiResponse.success(res, result, 'Lấy danh sách mã giảm giá thành công');
});

const getVoucherById = catchAsync(async (req, res) => {
  const voucher = await platformService.getVoucherById(req.params.id);
  ApiResponse.success(res, voucher, 'Lấy chi tiết mã giảm giá thành công');
});

const createVoucher = catchAsync(async (req, res) => {
  const voucher = await platformService.createVoucher(req.user.id, req.body);
  ApiResponse.created(res, voucher, 'Tạo mã giảm giá mới thành công');
});

const updateVoucher = catchAsync(async (req, res) => {
  const voucher = await platformService.updateVoucher(req.params.id, req.body);
  ApiResponse.success(res, voucher, 'Cập nhật mã giảm giá thành công');
});

const deleteVoucher = catchAsync(async (req, res) => {
  const result = await platformService.deleteVoucher(req.params.id);
  ApiResponse.success(res, result, result.message);
});

export default {
  getSettings,
  getSettingByKey,
  updateSetting,
  getAuditLogs,
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  getVouchers,
  getVoucherById,
  createVoucher,
  updateVoucher,
  deleteVoucher,
};
