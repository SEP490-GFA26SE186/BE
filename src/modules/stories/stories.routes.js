import { Router } from 'express';
import storiesController from './stories.controller.js';
import storiesValidation from './stories.validation.js';
import { auth, validate } from '../../middlewares/index.js';

const router = Router();

// All story routes require authenticated user (parent, moderator, admin)
router.use(auth);

// Story collection endpoints
router
  .route('/')
  .post(validate(storiesValidation.createStory), storiesController.createStory)
  .get(validate(storiesValidation.getStories), storiesController.getStories);

// Story detail endpoints
router
  .route('/:id')
  .get(validate(storiesValidation.getStory), storiesController.getStoryById)
  .put(validate(storiesValidation.updateStory), storiesController.updateStory)
  .delete(validate(storiesValidation.deleteStory), storiesController.deleteStory);

// Character slot bindings
router.put(
  '/:id/characters',
  validate(storiesValidation.bindCharacters),
  storiesController.bindCharacters
);

// Story Editor: Pages management
router.post(
  '/:id/pages',
  validate(storiesValidation.createPage),
  storiesController.createPage
);

router
  .route('/:id/pages/:pageId')
  .put(validate(storiesValidation.updatePage), storiesController.updatePage)
  .delete(validate(storiesValidation.deletePage), storiesController.deletePage);

// Story Editor: Choice / Branching management
router.put(
  '/:id/pages/:pageId/choices/:choiceId',
  validate(storiesValidation.updateChoice),
  storiesController.updateChoice
);

// Story Review Mode: Parent verifies 100% pages to mark ready
router.post(
  '/:id/review',
  validate(storiesValidation.reviewStory),
  storiesController.reviewStory
);

// Story Publishing: Clone to published version with de-personalization
router.post(
  '/:id/publish-version',
  validate(storiesValidation.publishStoryVersion),
  storiesController.publishStoryVersion
);

export default router;
