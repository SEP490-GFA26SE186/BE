import { StatusCodes } from 'http-status-codes';
import contentLibraryService from './content-library.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

// =============================================================================
// Backgrounds Controllers
// =============================================================================

const getBackgrounds = catchAsync(async (req, res) => {
  const result = await contentLibraryService.getBackgrounds(req.query);
  ApiResponse.success(res, { data: result, message: 'Lấy danh sách ảnh nền thành công' });
});

const getBackgroundById = catchAsync(async (req, res) => {
  const background = await contentLibraryService.getBackgroundById(req.params.id);
  ApiResponse.success(res, { data: background, message: 'Lấy chi tiết ảnh nền thành công' });
});

const createBackground = catchAsync(async (req, res) => {
  const background = await contentLibraryService.createBackground(req.user.id, req.body);
  ApiResponse.created(res, { data: background, message: 'Thêm mới ảnh nền thành công' });
});

const updateBackground = catchAsync(async (req, res) => {
  const updated = await contentLibraryService.updateBackground(req.params.id, req.body);
  ApiResponse.success(res, { data: updated, message: 'Cập nhật ảnh nền thành công' });
});

const deleteBackground = catchAsync(async (req, res) => {
  const result = await contentLibraryService.deleteBackground(req.params.id);
  ApiResponse.success(res, { data: result, message: result.message });
});

// =============================================================================
// UI Audio Assets Controllers
// =============================================================================

const getUiAudioAssets = catchAsync(async (req, res) => {
  const result = await contentLibraryService.getUiAudioAssets(req.query);
  ApiResponse.success(res, { data: result, message: 'Lấy danh sách âm thanh giao diện thành công' });
});

const getUiAudioAssetByKey = catchAsync(async (req, res) => {
  const { key } = req.params;
  const { lang = 'vi' } = req.query;
  const asset = await contentLibraryService.getUiAudioAssetByKey(key, lang);
  ApiResponse.success(res, { data: asset, message: 'Lấy âm thanh giao diện thành công' });
});

const getUiAudioAssetById = catchAsync(async (req, res) => {
  const asset = await contentLibraryService.getUiAudioAssetById(req.params.id);
  ApiResponse.success(res, { data: asset, message: 'Lấy chi tiết âm thanh giao diện thành công' });
});

const createUiAudioAsset = catchAsync(async (req, res) => {
  const asset = await contentLibraryService.createUiAudioAsset(req.body);
  ApiResponse.created(res, { data: asset, message: 'Thêm mới âm thanh giao diện thành công' });
});

const updateUiAudioAsset = catchAsync(async (req, res) => {
  const updated = await contentLibraryService.updateUiAudioAsset(req.params.id, req.body);
  ApiResponse.success(res, { data: updated, message: 'Cập nhật âm thanh giao diện thành công' });
});

const deleteUiAudioAsset = catchAsync(async (req, res) => {
  const result = await contentLibraryService.deleteUiAudioAsset(req.params.id);
  ApiResponse.success(res, { data: result, message: result.message });
});

// =============================================================================
// Checklist Items Controllers
// =============================================================================

const getChecklistItems = catchAsync(async (req, res) => {
  const items = await contentLibraryService.getChecklistItems(req.query);
  ApiResponse.success(res, { data: items, message: 'Lấy danh sách tiêu chí kiểm duyệt thành công' });
});

const getChecklistItemById = catchAsync(async (req, res) => {
  const item = await contentLibraryService.getChecklistItemById(req.params.id);
  ApiResponse.success(res, { data: item, message: 'Lấy chi tiết tiêu chí kiểm duyệt thành công' });
});

const createChecklistItem = catchAsync(async (req, res) => {
  const item = await contentLibraryService.createChecklistItem(req.body);
  ApiResponse.created(res, { data: item, message: 'Thêm mới tiêu chí kiểm duyệt thành công' });
});

const updateChecklistItem = catchAsync(async (req, res) => {
  const updated = await contentLibraryService.updateChecklistItem(req.params.id, req.body);
  ApiResponse.success(res, { data: updated, message: 'Cập nhật tiêu chí kiểm duyệt thành công' });
});

const deleteChecklistItem = catchAsync(async (req, res) => {
  const result = await contentLibraryService.deleteChecklistItem(req.params.id);
  ApiResponse.success(res, { data: result, message: result.message });
});

// =============================================================================
// Blocked Keywords Controllers
// =============================================================================

// =============================================================================
// Stats Controller
// =============================================================================

const getContentLibraryStats = catchAsync(async (_req, res) => {
  const stats = await contentLibraryService.getContentLibraryStats();
  ApiResponse.success(res, { data: stats, message: 'Lấy thống kê thư viện tài nguyên thành công' });
});

export default {
  getBackgrounds,
  getBackgroundById,
  createBackground,
  updateBackground,
  deleteBackground,
  getUiAudioAssets,
  getUiAudioAssetByKey,
  getUiAudioAssetById,
  createUiAudioAsset,
  updateUiAudioAsset,
  deleteUiAudioAsset,
  getChecklistItems,
  getChecklistItemById,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  getContentLibraryStats,
};
