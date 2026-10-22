import { Router } from 'express';
import eqSkillsController from './eq-skills.controller.js';

const router = Router();

// Publicly readable EQ skills endpoints
router.get('/', eqSkillsController.getEqSkills);
router.get('/:id', eqSkillsController.getEqSkillById);

export default router;
