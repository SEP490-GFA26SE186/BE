import { StatusCodes } from 'http-status-codes';
import storiesService from './stories.service.js';
import editorService from './stories.editor.service.js';
import generationService from './stories.generation.service.js';
import narrationService from './stories.narration.service.js';
import { ApiError, ApiResponse, catchAsync } from '../../utils/index.js';

const createStory = catchAsync(async (req, res) => {
  const story = await storiesService.createStory(req.user, req.body);
  return ApiResponse.created(res, { message: 'Tạo truyện thành công', data: { story } });
});

const getStories = catchAsync(async (req, res) => {
  const result = await storiesService.getStories(req.user, req.query);
  return ApiResponse.paginated(res, {
    data: result.stories,
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getStoryById = catchAsync(async (req, res) => {
  const story = await storiesService.getStoryById(req.user, req.params.id);
  return ApiResponse.success(res, { data: { story } });
});

const updateStory = catchAsync(async (req, res) => {
  const story = await storiesService.updateStory(req.user, req.params.id, req.body);
  return ApiResponse.success(res, { message: 'Cập nhật truyện thành công', data: { story } });
});

const bindCharacters = catchAsync(async (req, res) => {
  const story = await storiesService.bindCharacters(req.user, req.params.id, req.body.characters);
  return ApiResponse.success(res, { message: 'Đổi nhân vật của truyện thành công', data: { story } });
});

const deleteStory = catchAsync(async (req, res) => {
  await storiesService.deleteStory(req.user, req.params.id);
  return ApiResponse.success(res, { message: 'Đã xoá truyện' });
});

// ---------------------------------------------------------------------------
// Editor (spec §4.2). Moi thao tac tra lai chi tiet truyen (trang da danh so lai, status moi).
// ---------------------------------------------------------------------------

const updatePage = catchAsync(async (req, res) => {
  const { id, pageId } = req.params;
  const story = await editorService.updatePage(req.user, id, pageId, req.body);
  return ApiResponse.success(res, { message: 'Đã lưu trang', data: { story } });
});

const createPage = catchAsync(async (req, res) => {
  const story = await editorService.addPage(req.user, req.params.id, req.body);
  return ApiResponse.created(res, { message: 'Đã thêm trang', data: { story } });
});

const deletePage = catchAsync(async (req, res) => {
  const { id, pageId } = req.params;
  const story = await editorService.deletePage(req.user, id, pageId);
  return ApiResponse.success(res, { message: 'Đã xoá trang', data: { story } });
});

const updateCheckpoint = catchAsync(async (req, res) => {
  const { id, cpId } = req.params;
  const story = await editorService.updateCheckpoint(req.user, id, cpId, req.body);
  return ApiResponse.success(res, { message: 'Đã lưu điểm dừng', data: { story } });
});

const createCheckpoint = catchAsync(async (req, res) => {
  const story = await editorService.addCheckpoint(req.user, req.params.id, req.body);
  return ApiResponse.created(res, { message: 'Đã thêm điểm dừng', data: { story } });
});

const deleteCheckpoint = catchAsync(async (req, res) => {
  const { id, cpId } = req.params;
  const story = await editorService.deleteCheckpoint(req.user, id, cpId);
  return ApiResponse.success(res, { message: 'Đã xoá điểm dừng', data: { story } });
});

const reviewStory = catchAsync(async (req, res) => {
  const story = await editorService.reviewStory(req.user, req.params.id);
  return ApiResponse.success(res, { message: 'Đã đánh dấu truyện là đã xem xong', data: { story } });
});

// Giong doc (spec TTS §5.4): chi dua lai doan loi / thieu. Tien do nam o `story.narration`.
const retryNarration = catchAsync(async (req, res) => {
  const story = await narrationService.retryNarration(req.user, req.params.id);
  return ApiResponse.success(res, { statusCode: StatusCodes.ACCEPTED, message: 'Đang tạo lại giọng đọc', data: { story } });
});

// ---------------------------------------------------------------------------
// Sinh chu (spec §4.3). Frontend goi GET /generation moi 2-3s toi khi succeeded/failed/blocked.
// ---------------------------------------------------------------------------

const generateStory = catchAsync(async (req, res) => {
  const { aiRequestId } = await generationService.startGeneration(req.user, req.params.id);
  return ApiResponse.success(res, {
    statusCode: StatusCodes.ACCEPTED,
    message: 'AI đang viết truyện',
    data: { aiRequestId },
  });
});

const getGeneration = catchAsync(async (req, res) => {
  const generation = await generationService.getGeneration(req.user, req.params.id);
  return ApiResponse.success(res, { data: { generation } });
});

// ---------------------------------------------------------------------------
// publish-version tra 501 lau dai (cho spec cho truyen).
// ---------------------------------------------------------------------------

const notImplemented = (message) =>
  catchAsync(async () => {
    throw new ApiError(StatusCodes.NOT_IMPLEMENTED, message);
  });

const publishStoryVersion = notImplemented('Chức năng đăng bán sẽ có ở bản sau');

export default {
  createStory,
  getStories,
  getStoryById,
  updateStory,
  bindCharacters,
  deleteStory,
  updatePage,
  createPage,
  deletePage,
  updateCheckpoint,
  createCheckpoint,
  deleteCheckpoint,
  reviewStory,
  retryNarration,
  generateStory,
  getGeneration,
  publishStoryVersion,
};
