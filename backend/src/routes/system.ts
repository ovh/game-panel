import { Router } from 'express';
import { rootOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { checkPanelUpdate, getPanelUpdateStatus, startPanelUpdate } from '../services/panelUpdates.js';
import { requireBodyObject } from '../utils/httpValidation.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { nowIso } from '../utils/time.js';

const router = Router();

// GET /api/system/health
router.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: nowIso() });
});

// GET /api/system/update/check
router.get('/update/check', rootOnly, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await checkPanelUpdate();
    return res.json(result);
  } catch (error) {
    return sendRouteError(res, error, {
      route: 'ROUTE:SYSTEM:UPDATE_CHECK',
      fallbackMessage: 'System update request failed',
    });
  }
});

// GET /api/system/update/status
router.get('/update/status', rootOnly, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await getPanelUpdateStatus();
    return res.json(result);
  } catch (error) {
    return sendRouteError(res, error, {
      route: 'ROUTE:SYSTEM:UPDATE_STATUS',
      fallbackMessage: 'System update request failed',
    });
  }
});

// POST /api/system/update
router.post('/update', rootOnly, async (req: AuthenticatedRequest, res) => {
  try {
    const body = requireBodyObject(req.body);
    const result = await startPanelUpdate({
      version: body.version,
      startedBy: req.user?.username ?? null,
    });

    return res.status(202).json(result);
  } catch (error) {
    return sendRouteError(res, error, {
      route: 'ROUTE:SYSTEM:UPDATE_START',
      fallbackMessage: 'System update request failed',
    });
  }
});

export default router;
