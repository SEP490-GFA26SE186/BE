import { Router } from 'express';
import { kidAuth, validate } from '../../middlewares/index.js';
import kidController from './kid.controller.js';
import kidValidation from './kid.validation.js';

// Kid Mode (rev8): chi token `kid_session` (POST /auth/kid-mode/enter). Thay cho /reading-sessions cu.
const router = Router();
router.use(kidAuth);

router.get('/me', kidController.getMe);
router.get('/bookshelf', kidController.getShelf);
router.get('/ui-audio', kidController.getUiAudio);
router.post('/sessions', validate(kidValidation.startSession), kidController.startSession);
router.get('/sessions/:sessionId', validate(kidValidation.getSession), kidController.getSession);
router.put('/sessions/:sessionId/progress', validate(kidValidation.saveProgress), kidController.saveProgress);
router.post('/sessions/:sessionId/answers', validate(kidValidation.answer), kidController.answer);
router.post('/sessions/:sessionId/complete', validate(kidValidation.complete), kidController.complete);

export default router;
