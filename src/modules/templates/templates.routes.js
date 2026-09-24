import { Router } from 'express';
import templatesController from './templates.controller.js';
import templatesValidation from './templates.validation.js';
import { auth, authorize, validate } from '../../middlewares/index.js';

const router = Router();

// Publicly browse story templates
router.get('/', validate(templatesValidation.getTemplates), templatesController.getTemplates);
router.get('/:id', validate(templatesValidation.getTemplate), templatesController.getTemplateById);

// Content management endpoints (require authenticated user with moderator/admin role)
router.post(
  '/',
  auth,
  authorize('admin', 'moderator'),
  validate(templatesValidation.createTemplate),
  templatesController.createTemplate
);
router.put(
  '/:id',
  auth,
  authorize('admin', 'moderator'),
  validate(templatesValidation.updateTemplate),
  templatesController.updateTemplate
);
router.delete(
  '/:id',
  auth,
  authorize('admin'),
  validate(templatesValidation.deleteTemplate),
  templatesController.deleteTemplate
);

export default router;
