import { Router, type Response } from 'express';

const router = Router();

/**
 * Simple health check.
 */
router.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

export default router;
