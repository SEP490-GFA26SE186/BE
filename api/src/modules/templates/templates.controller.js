import templatesService from './templates.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const getTemplates = catchAsync(async (req, res) => {
  const result = await templatesService.getTemplates(req.query);

  return ApiResponse.paginated(res, {
    data: result.templates,
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getTemplateById = catchAsync(async (req, res) => {
  const template = await templatesService.getTemplateById(req.params.id);

  return ApiResponse.success(res, {
    data: { template },
  });
});

const createTemplate = catchAsync(async (req, res) => {
  const template = await templatesService.createTemplate(req.user.id, req.body);

  return ApiResponse.created(res, {
    message: 'Tạo kịch bản mẫu thành công',
    data: { template },
  });
});

const updateTemplate = catchAsync(async (req, res) => {
  const template = await templatesService.updateTemplate(req.params.id, req.body);

  return ApiResponse.success(res, {
    message: 'Cập nhật kịch bản mẫu thành công',
    data: { template },
  });
});

const deleteTemplate = catchAsync(async (req, res) => {
  const result = await templatesService.deleteTemplate(req.params.id);

  return ApiResponse.success(res, {
    message: result.message,
  });
});

export default {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
