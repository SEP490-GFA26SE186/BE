import { Router } from 'express';
import storiesController from './stories.controller.js';
import storiesValidation from './stories.validation.js';
import { auth, authorize, validate } from '../../middlewares/index.js';

const router = Router();

// Moi route can dang nhap. Quyen theo truyen (chu truyen / specialist / admin) kiem trong
// stories.access.js.
router.use(auth);

// Bang gia AI viet truyen theo do dai (khai bao truoc '/:id' de khong bi hieu la id).
router.get('/ai-pricing', storiesController.getAiPricing);
// Phan tich loi ke "Ke chuyen nha minh" (spec family-story §5.1) — chi phu huynh.
router.post('/analyze', authorize('parent'), validate(storiesValidation.analyzeStory), storiesController.analyzeStory);

// ---- Truyen (spec §4.1) ----
router
  .route('/')
  .post(validate(storiesValidation.createStory), storiesController.createStory)
  .get(validate(storiesValidation.getStories), storiesController.getStories);

router
  .route('/:id')
  .get(validate(storiesValidation.getStory), storiesController.getStoryById)
  .put(validate(storiesValidation.updateStory), storiesController.updateStory)
  .delete(validate(storiesValidation.deleteStory), storiesController.deleteStory);

// Anh bia = anh mot canh; null = canh 1 (chi phu huynh, chu truyen).
router.put('/:id/cover', authorize('parent'), validate(storiesValidation.setCover), storiesController.setCover);
router.put('/:id/characters', validate(storiesValidation.bindCharacters), storiesController.bindCharacters);

// ---- Editor (spec §4.2) ----
router.post('/:id/pages', validate(storiesValidation.createPage), storiesController.createPage);
router
  .route('/:id/pages/:pageId')
  .put(validate(storiesValidation.updatePage), storiesController.updatePage)
  .delete(validate(storiesValidation.deletePage), storiesController.deletePage);

router.post('/:id/checkpoints', validate(storiesValidation.createCheckpoint), storiesController.createCheckpoint);
router
  .route('/:id/checkpoints/:cpId')
  .put(validate(storiesValidation.updateCheckpoint), storiesController.updateCheckpoint)
  .delete(validate(storiesValidation.deleteCheckpoint), storiesController.deleteCheckpoint);

router.post('/:id/review', validate(storiesValidation.reviewStory), storiesController.reviewStory);
router.post('/:id/narration/retry', validate(storiesValidation.storyOnly), storiesController.retryNarration);
router.post('/:id/publish-version', validate(storiesValidation.storyOnly), storiesController.publishStoryVersion);

// ---- Sinh chu (spec §4.3) — Task 9 ----
router.post('/:id/generate', validate(storiesValidation.storyOnly), storiesController.generateStory);
// Tranh AI: bat tranh + ve moi canh con thieu / ve lai mot canh (giu credit tung canh).
router.post('/:id/images', validate(storiesValidation.storyOnly), storiesController.drawImages);
router.post('/:id/scenes/:sceneId/image', validate(storiesValidation.sceneOnly), storiesController.redrawScene);
router.get('/:id/generation', validate(storiesValidation.storyOnly), storiesController.getGeneration);

export default router;
