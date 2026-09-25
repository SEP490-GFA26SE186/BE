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
// Community reporting (Any authenticated parent)
// ---------------------------------------------------------------------------
router.post(
  '/reports',
  auth,
  validate(moderationValidation.createReport),
  moderationController.createReport,
);

// ---------------------------------------------------------------------------
// Moderator & Admin endpoints
// ---------------------------------------------------------------------------
const requireModerator = [auth, authorize('admin', 'moderator')];
const requireAdmin = [auth, authorize('admin')];

// Blocked keywords management
router.get('/keywords', ...requireModerator, moderationController.getBlockedKeywords);
router.post(
  '/keywords',
  ...requireModerator,
  validate(moderationValidation.createKeyword),
  moderationController.addBlockedKeyword,
);
router.delete('/keywords/:id', ...requireAdmin, moderationController.deleteBlockedKeyword);

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

// Reports management
router.get('/reports', ...requireModerator, moderationController.getReports);
router.put(
  '/reports/:reportId/resolve',
  ...requireModerator,
  validate(moderationValidation.resolveReport),
  moderationController.resolveReport,
);

// Creator strikes
router.post(
  '/strikes',
  ...requireModerator,
  validate(moderationValidation.issueStrike),
  moderationController.issueStrike,
);
router.get('/sellers/:sellerId/strikes', ...requireModerator, moderationController.getSellerStrikes);

export default router;
