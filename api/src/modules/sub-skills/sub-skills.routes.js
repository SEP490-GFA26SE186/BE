import { Router } from 'express';
import { auth, authorize, validate } from '../../middlewares/index.js';
import subSkillsController from './sub-skills.controller.js';
import subSkillsValidation from './sub-skills.validation.js';

const router = Router();
const managers = [auth, authorize('specialist', 'admin')];

// Phu huynh chi thay ky nang con dang dung (khong kem so dem); Specialist thay tat ca.
router.get('/', auth, validate(subSkillsValidation.list), subSkillsController.getSubSkills);
router.post('/', ...managers, validate(subSkillsValidation.create), subSkillsController.createSubSkill);
router.put('/:id', ...managers, validate(subSkillsValidation.update), subSkillsController.updateSubSkill);
router.delete('/:id', ...managers, validate(subSkillsValidation.remove), subSkillsController.deleteSubSkill);

export default router;
