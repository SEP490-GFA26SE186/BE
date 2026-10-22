import { StatusCodes } from 'http-status-codes';
import { ApiResponse, catchAsync } from '../../utils/index.js';
import service from './question-templates.service.js';

const list = catchAsync(async (req, res) => ApiResponse.success(res, { data: await service.listTemplates(req.query) }));
const create = catchAsync(async (req, res) =>
  ApiResponse.success(res, { statusCode: StatusCodes.CREATED, message: 'Đã tạo mẫu câu hỏi', data: await service.createTemplate(req.user, req.body) }),
);
const duplicate = catchAsync(async (req, res) =>
  ApiResponse.success(res, { statusCode: StatusCodes.CREATED, message: 'Đã nhân bản mẫu câu hỏi', data: await service.duplicateTemplate(req.user, req.params.id) }),
);
const update = catchAsync(async (req, res) => ApiResponse.success(res, { message: 'Đã lưu mẫu câu hỏi', data: await service.updateTemplate(req.params.id, req.body) }));
const saveDraft = catchAsync(async (req, res) => ApiResponse.success(res, { message: 'Đã lưu bản nháp', data: await service.saveDraft(req.user, req.params.id, req.body) }));
const publish = catchAsync(async (req, res) => ApiResponse.success(res, { message: 'Đã ban hành phiên bản', data: await service.publish(req.user, req.params.id) }));
const remove = catchAsync(async (req, res) => {
  const result = await service.deleteTemplate(req.params.id);
  return ApiResponse.success(res, { message: result.message, data: result });
});

export default { list, create, duplicate, update, saveDraft, publish, remove };
