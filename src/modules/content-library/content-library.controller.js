import { StatusCodes } from 'http-status-codes';
import contentLibraryService from './content-library.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

// =============================================================================
// Backgrounds Controllers
// =============================================================================

const getBackgrounds = catchAsync(async (req, res) => {
  const result = await contentLibraryService.getBackgrounds(req.query);
  ApiResponse.success(res, result, 'Lấy danh sách ảnh nền thành công');
});

const getBackgroundById = catchAsync(async (req, res) => {
  const background = await contentLibraryService.getBackgroundById(req.params.id);
  ApiResponse.success(res, background, 'Lấy chi tiết ảnh nền thành công');
});

const createBackground = catchAsync(async (req, res) => {
  const background = await contentLibraryService.createBackground(req.user.id, req.body);
  ApiResponse.created(res, background, 'Thêm mới ảnh nền thành công');
});

const updateBackground = catchAsync(async (req, res) => {
  const updated = await contentLibraryService.updateBackground(req.params.id, req.body);
  ApiResponse.success(res, updated, 'Cập nhật ảnh nền thành công');
});

const deleteBackground = catchAsync(async (req, res) => {
  const result = await contentLibraryService.deleteBackground(req.params.id);
  ApiResponse.success(res, result, result.message);
});

// =============================================================================
// UI Audio Assets Controllers
// =============================================================================

const getUiAudioAssets = catchAsync(async (req, res) => {
  const result = await contentLibraryService.getUiAudioAssets(req.query);
  ApiResponse.success(res, result, 'Lấy danh sách âm thanh giao diện thành công');
});

const getUiAudioAssetByKey = catchAsync(async (req, res) => {
  const { key } = req.params;
  const { lang = 'vi' } = req.query;
  const asset = await contentLibraryService.getUiAudioAssetByKey(key, lang);
  ApiResponse.success(res, asset, 'Lấy âm thanh giao diện thành công');
});

const getUiAudioAssetById = catchAsync(async (req, res) => {
  const asset = await contentLibraryService.getUiAudioAssetById(req.params.id);
  ApiResponse.success(res, asset, 'Lấy chi tiết âm thanh giao diện thành công');
});

const createUiAudioAsset = catchAsync(async (req, res) => {
  const asset = await contentLibraryService.createUiAudioAsset(req.body);
  ApiResponse.created(res, asset, 'Thêm mới âm thanh giao diện thành công');
});

const updateUiAudioAsset = catchAsync(async (req, res) => {
  const updated = await contentLibraryService.updateUiAudioAsset(req.params.id, req.body);
  ApiResponse.success(res, updated, 'Cập nhật âm thanh giao diện thành công');
});

const deleteUiAudioAsset = catchAsync(async (req, res) => {
  const result = await contentLibraryService.deleteUiAudioAsset(req.params.id);
  ApiResponse.success(res, result, result.message);
});

// =============================================================================
// Checklist Items Controllers
// =============================================================================

const getChecklistItems = catchAsync(async (req, res) => {
  const items = await contentLibraryService.getChecklistItems(req.query);
  ApiResponse.success(res, items, 'Lấy danh sách tiêu chí kiểm duyệt thành công');
});

const getChecklistItemById = catchAsync(async (req, res) => {
  const item = await contentLibraryService.getChecklistItemById(req.params.id);
  ApiResponse.success(res, item, 'Lấy chi tiết tiêu chí kiểm duyệt thành công');
});

const createChecklistItem = catchAsync(async (req, res) => {
  const item = await contentLibraryService.createChecklistItem(req.body);
  ApiResponse.created(res, item, 'Thêm mới tiêu chí kiểm duyệt thành công');
});

const updateChecklistItem = catchAsync(async (req, res) => {
  const updated = await contentLibraryService.updateChecklistItem(req.params.id, req.body);
  ApiResponse.success(res, updated, 'Cập nhật tiêu chí kiểm duyệt thành công');
});

const deleteChecklistItem = catchAsync(async (req, res) => {
  const result = await contentLibraryService.deleteChecklistItem(req.params.id);
  ApiResponse.success(res, result, result.message);
});

// =============================================================================
// Blocked Keywords Controllers
// =============================================================================

const bulkImportKeywords = catchAsync(async (req, res) => {
  const result = await contentLibraryService.bulkImportKeywords(req.user, req.body.keywords);
  ApiResponse.success(res, result, result.message);
});

const updateKeyword = catchAsync(async (req, res) => {
  const updated = await contentLibraryService.updateKeyword(req.params.id, req.body);
  ApiResponse.success(res, updated, 'Cập nhật từ khóa cấm thành công');
});

// =============================================================================
// Granular Template Management Controllers
// =============================================================================

const addTemplateStage = catchAsync(async (req, res) => {
  const stage = await contentLibraryService.addTemplateStage(req.params.id, req.body);
  ApiResponse.created(res, stage, 'Thêm phân đoạn cho kịch bản mẫu thành công');
});

const updateTemplateStage = catchAsync(async (req, res) => {
  const updated = await contentLibraryService.updateTemplateStage(req.params.stageId, req.body);
  ApiResponse.success(res, updated, 'Cập nhật phân đoạn kịch bản mẫu thành công');
});

const deleteTemplateStage = catchAsync(async (req, res) => {
  const result = await contentLibraryService.deleteTemplateStage(req.params.stageId);
  ApiResponse.success(res, result, result.message);
});

const addOrUpdateTemplateSlots = catchAsync(async (req, res) => {
  const slots = await contentLibraryService.addOrUpdateTemplateSlots(req.params.id, req.body.slots);
  ApiResponse.success(res, slots, 'Cập nhật danh sách vị trí nhân vật thành công');
});

const deleteTemplateSlot = catchAsync(async (req, res) => {
  const result = await contentLibraryService.deleteTemplateSlot(req.params.id, req.params.slotKey);
  ApiResponse.success(res, result, result.message);
});

const addTemplateChoice = catchAsync(async (req, res) => {
  const choice = await contentLibraryService.addTemplateChoice(req.params.stageId, req.body);
  ApiResponse.created(res, choice, 'Thêm lựa chọn rẽ nhánh kèm tín hiệu cảm xúc thành công');
});

const updateTemplateChoice = catchAsync(async (req, res) => {
  const updated = await contentLibraryService.updateTemplateChoice(req.params.choiceId, req.body);
  ApiResponse.success(res, updated, 'Cập nhật lựa chọn rẽ nhánh thành công');
});

const deleteTemplateChoice = catchAsync(async (req, res) => {
  const result = await contentLibraryService.deleteTemplateChoice(req.params.choiceId);
  ApiResponse.success(res, result, result.message);
});

// =============================================================================
// Stats Controller
// =============================================================================

const getContentLibraryStats = catchAsync(async (_req, res) => {
  const stats = await contentLibraryService.getContentLibraryStats();
  ApiResponse.success(res, stats, 'Lấy thống kê thư viện tài nguyên thành công');
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
  bulkImportKeywords,
  updateKeyword,
  addTemplateStage,
  updateTemplateStage,
  deleteTemplateStage,
  addOrUpdateTemplateSlots,
  deleteTemplateSlot,
  addTemplateChoice,
  updateTemplateChoice,
  deleteTemplateChoice,
  getContentLibraryStats,
};
