import catchAsync from '../../utils/catchAsync.js';
import ApiResponse from '../../utils/ApiResponse.js';
import topicsService from './topics.service.js';

const getTopics = catchAsync(async (req, res) => {
  const result = await topicsService.getTopics(req.query);
  return ApiResponse.success(res, {
    message: 'Lấy danh sách chủ đề bài học thành công',
    data: result.items,
    meta: result.meta,
  });
});

const getTopicById = catchAsync(async (req, res) => {
  const topic = await topicsService.getTopicById(req.params.id);
  return ApiResponse.success(res, {
    message: 'Lấy chi tiết chủ đề bài học thành công',
    data: topic,
  });
});

const createTopic = catchAsync(async (req, res) => {
  const topic = await topicsService.createTopic(req.user.id, req.body);
  return ApiResponse.created(res, {
    message: 'Tạo chủ đề bài học mới thành công',
    data: topic,
  });
});

const updateTopic = catchAsync(async (req, res) => {
  const topic = await topicsService.updateTopic(req.params.id, req.body);
  return ApiResponse.success(res, {
    message: 'Cập nhật chủ đề bài học thành công',
    data: topic,
  });
});

const deleteTopic = catchAsync(async (req, res) => {
  const result = await topicsService.deleteTopic(req.params.id);
  return ApiResponse.success(res, {
    message: result.message,
  });
});

export default {
  getTopics,
  getTopicById,
  createTopic,
  updateTopic,
  deleteTopic,
};
