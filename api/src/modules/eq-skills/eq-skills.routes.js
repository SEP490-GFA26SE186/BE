import { Router } from 'express';
import { auth } from '../../middlewares/index.js';
import eqSkillsController from './eq-skills.controller.js';

const router = Router();

// Publicly readable EQ skills endpoints
router.get('/', eqSkillsController.getEqSkills);
// Dat TRUOC '/:id' de khong bi route tham so nuot.
router.get('/casel-references', auth, eqSkillsController.getCaselReferences);
router.get('/:id', eqSkillsController.getEqSkillById);

export default router;
