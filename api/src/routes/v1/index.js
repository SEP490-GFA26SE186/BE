import express from 'express';

import authRoutes from '../../modules/auth/auth.routes.js';
import childrenRoutes from '../../modules/children/children.routes.js';
import charactersRoutes from '../../modules/characters/characters.routes.js';
import eqSkillsRoutes from '../../modules/eq-skills/eq-skills.routes.js';
import bookshelfRoutes from '../../modules/bookshelf/bookshelf.routes.js';
import kidRoutes from '../../modules/kid/kid.routes.js';
import billingRoutes from '../../modules/billing/billing.routes.js';
import marketRoutes from '../../modules/market/market.routes.js';
import keywordsRouter from '../../modules/keywords/keywords.routes.js';
import { appealsAdminRouter, moderationMonitoringRouter, reportRouter, sellerStrikesRouter } from '../../modules/monitoring/monitoring.routes.js';
import { adminWithdrawalsRouter, sellerMoneyRouter } from '../../modules/market/withdrawals.routes.js';
import { listingsRouter, moderationReviewRouter, sellersRouter } from '../../modules/publishing/publishing.routes.js';
import { plansRouter, subscriptionsRouter } from '../../modules/plans/plans.routes.js';
import storiesRoutes from '../../modules/stories/stories.routes.js';
import subSkillsRoutes from '../../modules/sub-skills/sub-skills.routes.js';
import questionTemplatesRoutes from '../../modules/question-templates/question-templates.routes.js';
import topicsRoutes from '../../modules/topics/topics.routes.js';
import checkpointReviewRoutes from '../../modules/checkpoint-review/checkpoint-review.routes.js';

import contentLibraryRouter, {
  backgroundsRouter,
  uiAudioAssetsRouter,
  checklistItemsRouter,
} from '../../modules/content-library/content-library.routes.js';
import adminRouter, { parentRefundRouter } from '../../modules/admin/admin.routes.js';
import { reviewModerationRouter, reviewsRouter } from '../../modules/reviews/reviews.routes.js';


const router = express.Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Module routes
router.use('/auth', authRoutes);
router.use('/children', childrenRoutes);
router.use('/characters', charactersRoutes);
router.use('/eq-skills', eqSkillsRoutes);
router.use('/stories', storiesRoutes);
router.use('/topics', topicsRoutes);
router.use('/checkpoint-review', checkpointReviewRoutes);
router.use('/sub-skills', subSkillsRoutes);
router.use('/question-templates', questionTemplatesRoutes);
router.use('/backgrounds', backgroundsRouter);
router.use('/ui-audio-assets', uiAudioAssetsRouter);
router.use('/checklist-items', checklistItemsRouter);
router.use('/content-library', contentLibraryRouter);
router.use('/bookshelf', bookshelfRoutes);
router.use('/kid', kidRoutes);
router.use('/payments', billingRoutes);
router.use('/payments', parentRefundRouter);
router.use('/market', marketRoutes);
router.use('/market', reportRouter);
router.use('/market', reviewsRouter);
router.use('/sellers', sellersRouter);
router.use('/sellers', sellerMoneyRouter);
router.use('/sellers', sellerStrikesRouter);
router.use('/listings', listingsRouter);
router.use('/moderation', moderationReviewRouter);
router.use('/moderation', keywordsRouter);
router.use('/moderation', moderationMonitoringRouter);
router.use('/moderation', reviewModerationRouter);
router.use('/admin', adminWithdrawalsRouter);
router.use('/admin', appealsAdminRouter);
router.use('/admin', adminRouter);
router.use('/plans', plansRouter);
router.use('/subscriptions', subscriptionsRouter);

export default router;

