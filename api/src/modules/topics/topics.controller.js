import { StatusCodes } from 'http-status-codes';
import { ApiResponse, catchAsync } from '../../utils/index.js';
import topicsService from './topics.service.js';

// data la mang (GET), khop Web topicService.getTopics (dung chung cho phu huynh va Moderator).
const getTopics = catchAsync(async (req, res) => ApiResponse.success(res, { data: await topicsService.listTopics(req.user, req.query) }));
const createTopic = catchAsync(async (req, res) =>
  ApiResponse.success(res, { statusCode: StatusCodes.CREATED, message: 'Đã tạo bài học', data: await topicsService.createTopic(req.user, req.body) }),
);
const updateTopic = catchAsync(async (req, res) =>
  ApiResponse.success(res, { message: 'Đã lưu bài học', data: await topicsService.updateTopic(req.params.id, req.body) }),
);
const deleteTopic = catchAsync(async (req, res) => {
  const result = await topicsService.deleteTopic(req.params.id);
  return ApiResponse.success(res, { message: result.message, data: result });
});

export default { getTopics, createTopic, updateTopic, deleteTopic };
