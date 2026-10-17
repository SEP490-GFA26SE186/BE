import { ApiResponse, catchAsync } from '../../utils/index.js';
import topicsService from './topics.service.js';

const getTopics = catchAsync(async (_req, res) => {
  const topics = await topicsService.getActiveTopics();
  // data la mang, khop Web topicService.getTopics (dung chung cho phu huynh va Moderator).
  return ApiResponse.success(res, { data: topics });
});

export default { getTopics };
