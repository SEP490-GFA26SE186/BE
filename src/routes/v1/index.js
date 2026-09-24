import express from 'express';

const router = express.Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// -------------------------------------------------------
// Mount module routes here as they are developed
// Example:
// import authRoutes from '../../modules/auth/auth.routes.js';
// router.use('/auth', authRoutes);
// -------------------------------------------------------

export default router;
