import { StatusCodes } from 'http-status-codes';
import { ApiResponse, catchAsync } from '../../utils/index.js';
import subSkillsService from './sub-skills.service.js';

const getSubSkills = catchAsync(async (req, res) => ApiResponse.success(res, { data: await subSkillsService.listSubSkills(req.user, req.query) }));
const createSubSkill = catchAsync(async (req, res) =>
  ApiResponse.success(res, { statusCode: StatusCodes.CREATED, message: 'Đã tạo kỹ năng con', data: await subSkillsService.createSubSkill(req.user, req.body) }),
);
const updateSubSkill = catchAsync(async (req, res) =>
  ApiResponse.success(res, { message: 'Đã lưu kỹ năng con', data: await subSkillsService.updateSubSkill(req.params.id, req.body) }),
);
const deleteSubSkill = catchAsync(async (req, res) => {
  const result = await subSkillsService.deleteSubSkill(req.params.id);
  return ApiResponse.success(res, { message: result.message, data: result });
});

export default { getSubSkills, createSubSkill, updateSubSkill, deleteSubSkill };
