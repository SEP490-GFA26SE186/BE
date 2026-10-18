import { Router } from 'express';
import moderationController from './moderation.controller.js';
import moderationValidation from './moderation.validation.js';
import { auth, authorize, validate } from '../../middlewares/index.js';

const router = Router();

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------
router.get('/checklist-items', moderationController.getChecklistItems);
router.post(
  '/check-text',
  validate(moderationValidation.checkText),
  moderationController.checkText,
);

// ---------------------------------------------------------------------------
// Moderator & Admin endpoints
// ---------------------------------------------------------------------------
const requireModerator = [auth, authorize('admin', 'moderator')];

// Moderation review queue and decisions
router.get('/reviews/queue', ...requireModerator, moderationController.getReviewQueue);
router.post(
  '/reviews/:listingId/claim',
  ...requireModerator,
  validate(moderationValidation.claimReview),
  moderationController.claimReview,
);
router.post(
  '/reviews/:reviewId/decision',
  ...requireModerator,
  validate(moderationValidation.reviewDecision),
  moderationController.submitReviewDecision,
);

export default router;
