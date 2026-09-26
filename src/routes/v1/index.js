import express from 'express';

import authRoutes from '../../modules/auth/auth.routes.js';
import childrenRoutes from '../../modules/children/children.routes.js';
import charactersRoutes from '../../modules/characters/characters.routes.js';
import eqSkillsRoutes from '../../modules/eq-skills/eq-skills.routes.js';
import templatesRoutes from '../../modules/templates/templates.routes.js';
import bookshelfRoutes from '../../modules/bookshelf/bookshelf.routes.js';
import readingSessionsRoutes from '../../modules/reading-sessions/reading-sessions.routes.js';
import marketplaceRoutes from '../../modules/marketplace/marketplace.routes.js';
import moderationRoutes from '../../modules/moderation/moderation.routes.js';
import { plansRouter, creditPacksRouter, subscriptionsRouter } from '../../modules/plans/plans.routes.js';
import storiesRoutes from '../../modules/stories/stories.routes.js';
import walletsRoutes from '../../modules/wallets/wallets.routes.js';

import contentLibraryRouter, {
  backgroundsRouter,
  uiAudioAssetsRouter,
  checklistItemsRouter,
} from '../../modules/content-library/content-library.routes.js';
import notificationsRoutes from '../../modules/notifications/notifications.routes.js';
import reportsRoutes from '../../modules/reports/reports.routes.js';
import platformRoutes from '../../modules/platform/platform.routes.js';

const router = express.Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Module routes
router.use('/auth', authRoutes);
router.use('/children', childrenRoutes);
router.use('/child-profiles', childrenRoutes);
router.use('/characters', charactersRoutes);
router.use('/eq-skills', eqSkillsRoutes);
router.use('/templates', templatesRoutes);
router.use('/stories', storiesRoutes);
router.use('/backgrounds', backgroundsRouter);
router.use('/ui-audio-assets', uiAudioAssetsRouter);
router.use('/checklist-items', checklistItemsRouter);
router.use('/content-library', contentLibraryRouter);
router.use('/bookshelf', bookshelfRoutes);
router.use('/reading-sessions', readingSessionsRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/moderation', moderationRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/reports', reportsRoutes);
router.use('/admin', platformRoutes);
router.use('/platform', platformRoutes);
router.use('/plans', plansRouter);
router.use('/credit-packs', creditPacksRouter);
router.use('/subscriptions', subscriptionsRouter);
router.use('/wallets', walletsRoutes);

export default router;

