import eqSkillsService from './eq-skills.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const getEqSkills = catchAsync(async (req, res) => {
  const skills = await eqSkillsService.getEqSkills(req.query);

  return ApiResponse.success(res, {
    data: { skills },
  });
});

const getEqSkillById = catchAsync(async (req, res) => {
  const skill = await eqSkillsService.getEqSkillById(req.params.id);

  return ApiResponse.success(res, {
    data: { skill },
  });
});

export default {
  getEqSkills,
  getEqSkillById,
};
