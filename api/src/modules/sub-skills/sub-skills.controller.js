import { ApiResponse, catchAsync } from '../../utils/index.js';
import subSkillsService from './sub-skills.service.js';

const getSubSkills = catchAsync(async (req, res) => ApiResponse.success(res, { data: await subSkillsService.listSubSkills(req.user, req.query) }));
const updateSubSkill = catchAsync(async (req, res) =>
  ApiResponse.success(res, { message: 'Đã lưu kỹ năng con', data: await subSkillsService.updateSubSkill(req.params.id, req.body) }),
);

export default { getSubSkills, updateSubSkill };
