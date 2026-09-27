import storiesService from './stories.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const createStory = catchAsync(async (req, res) => {
  const story = await storiesService.createStory(req.user, req.body);
  return ApiResponse.created(res, {
    message: 'Tạo truyện thành công',
    data: { story },
  });
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
  return ApiResponse.success(res, {
    data: { story },
  });
});

const updateStory = catchAsync(async (req, res) => {
  const story = await storiesService.updateStory(req.user, req.params.id, req.body);
  return ApiResponse.success(res, {
    message: 'Cập nhật truyện thành công',
    data: { story },
  });
});

const deleteStory = catchAsync(async (req, res) => {
  const result = await storiesService.deleteStory(req.user, req.params.id);
  return ApiResponse.success(res, {
    message: result.message,
  });
});

const bindCharacters = catchAsync(async (req, res) => {
  const story = await storiesService.bindCharacters(req.user, req.params.id, req.body.characters);
  return ApiResponse.success(res, {
    message: 'Gán nhân vật vào truyện thành công',
    data: { story },
  });
});

const updatePage = catchAsync(async (req, res) => {
  const page = await storiesService.updatePage(req.user, req.params.id, req.params.pageId, req.body);
  return ApiResponse.success(res, {
    message: 'Cập nhật trang truyện thành công',
    data: { page },
  });
});

const createPage = catchAsync(async (req, res) => {
  const page = await storiesService.createPage(req.user, req.params.id, req.body);
  return ApiResponse.created(res, {
    message: 'Thêm trang truyện thành công',
    data: { page },
  });
});

const deletePage = catchAsync(async (req, res) => {
  const result = await storiesService.deletePage(req.user, req.params.id, req.params.pageId);
  return ApiResponse.success(res, {
    message: result.message,
  });
});

const updateChoice = catchAsync(async (req, res) => {
  const choice = await storiesService.updateChoice(
    req.user,
    req.params.id,
    req.params.pageId,
    req.params.choiceId,
    req.body
  );
  return ApiResponse.success(res, {
    message: 'Cập nhật lựa chọn thành công',
    data: { choice },
  });
});

const reviewStory = catchAsync(async (req, res) => {
  const result = await storiesService.reviewStory(req.user, req.params.id);
  return ApiResponse.success(res, {
    message: result.message,
    data: { story: result.story },
  });
});

const publishStoryVersion = catchAsync(async (req, res) => {
  const story = await storiesService.publishStoryVersion(req.user, req.params.id, req.body || {});
  return ApiResponse.created(res, {
    message: 'Tạo bản sao xuất bản (gỡ cá nhân hoá) thành công',
    data: { story },
  });
});

export default {
  createStory,
  getStories,
  getStoryById,
  updateStory,
  deleteStory,
  bindCharacters,
  updatePage,
  createPage,
  deletePage,
  updateChoice,
  reviewStory,
  publishStoryVersion,
};
