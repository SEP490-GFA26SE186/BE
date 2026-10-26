import { StatusCodes } from 'http-status-codes';
import contentLibraryService from './content-library.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

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
  getUiAudioAssets,
  getUiAudioAssetByKey,
  getUiAudioAssetById,
  createUiAudioAsset,
  updateUiAudioAsset,
  deleteUiAudioAsset,
  getContentLibraryStats,
};
