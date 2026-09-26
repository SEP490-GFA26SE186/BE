import { Router } from 'express';
import templatesController from './templates.controller.js';
import templatesValidation from './templates.validation.js';
import contentLibraryController from '../content-library/content-library.controller.js';
import contentLibraryValidation from '../content-library/content-library.validation.js';
import { auth, authorize, validate } from '../../middlewares/index.js';

const router = Router();
const requireModerator = [auth, authorize('admin', 'moderator')];
const requireAdmin = [auth, authorize('admin')];

// Publicly browse story templates
router.get('/', validate(templatesValidation.getTemplates), templatesController.getTemplates);
router.get('/:id', validate(templatesValidation.getTemplate), templatesController.getTemplateById);

// Content management endpoints (require authenticated user with moderator/admin role)
router.post(
  '/',
  ...requireModerator,
  validate(templatesValidation.createTemplate),
  templatesController.createTemplate
);
router.put(
  '/:id',
  ...requireModerator,
  validate(templatesValidation.updateTemplate),
  templatesController.updateTemplate
);
router.delete(
  '/:id',
  ...requireAdmin,
  validate(templatesValidation.deleteTemplate),
  templatesController.deleteTemplate
);

// Granular stage management
router.post(
  '/:id/stages',
  ...requireModerator,
  validate(contentLibraryValidation.addTemplateStage),
  contentLibraryController.addTemplateStage
);
router.put(
  '/stages/:stageId',
  ...requireModerator,
  validate(contentLibraryValidation.updateTemplateStage),
  contentLibraryController.updateTemplateStage
);
router.delete(
  '/stages/:stageId',
  ...requireModerator,
  validate(contentLibraryValidation.deleteTemplateStage),
  contentLibraryController.deleteTemplateStage
);

// Granular slot management
router.post(
  '/:id/slots',
  ...requireModerator,
  validate(contentLibraryValidation.addOrUpdateTemplateSlots),
  contentLibraryController.addOrUpdateTemplateSlots
);
router.delete(
  '/:id/slots/:slotKey',
  ...requireModerator,
  validate(contentLibraryValidation.deleteTemplateSlot),
  contentLibraryController.deleteTemplateSlot
);

// Granular choice & EQ signal management
router.post(
  '/stages/:stageId/choices',
  ...requireModerator,
  validate(contentLibraryValidation.addTemplateChoice),
  contentLibraryController.addTemplateChoice
);
router.put(
  '/choices/:choiceId',
  ...requireModerator,
  validate(contentLibraryValidation.updateTemplateChoice),
  contentLibraryController.updateTemplateChoice
);
router.delete(
  '/choices/:choiceId',
  ...requireModerator,
  validate(contentLibraryValidation.deleteTemplateChoice),
  contentLibraryController.deleteTemplateChoice
);

export default router;
