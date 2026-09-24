import express from 'express';

import authRoutes from '../../modules/auth/auth.routes.js';
import childrenRoutes from '../../modules/children/children.routes.js';
import charactersRoutes from '../../modules/characters/characters.routes.js';
import eqSkillsRoutes from '../../modules/eq-skills/eq-skills.routes.js';
import templatesRoutes from '../../modules/templates/templates.routes.js';
import bookshelfRoutes from '../../modules/bookshelf/bookshelf.routes.js';
import readingSessionsRoutes from '../../modules/reading-sessions/reading-sessions.routes.js';

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
router.use('/templates', templatesRoutes);
router.use('/bookshelf', bookshelfRoutes);
router.use('/reading-sessions', readingSessionsRoutes);

export default router;
