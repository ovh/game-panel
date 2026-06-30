import { Router, type Response } from 'express';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { requireBodyObject, requirePositiveInt } from '../utils/httpValidation.js';
import {
    createScheduledTask,
    deleteScheduledTask,
    getScheduledTask,
    listScheduledTasks,
    updateScheduledTask,
} from '../services/scheduledTasks.js';
import { PERMISSIONS } from '../permissions.js';

const router = Router({ mergeParams: true });

// GET /api/servers/:id/scheduled-tasks
router.get(
    '/',
    requireServerPermission(PERMISSIONS.scheduledTasks.read),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const tasks = await listScheduledTasks(serverId);
            return res.json({ tasks });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:SCHEDULED_TASKS:LIST',
                fallbackMessage: 'Failed to list scheduled tasks',
                logContext: { serverId: req.params.id },
            });
        }
    }
);

// POST /api/servers/:id/scheduled-tasks
router.post(
    '/',
    requireServerPermission(PERMISSIONS.scheduledTasks.write),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
            const body = requireBodyObject(req.body);

            const task = await createScheduledTask(serverId, {
                type: body.type,
                schedule: body.schedule,
                enabled: body.enabled,
                payload: body.payload,
            });

            return res.status(201).json({ task });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:SCHEDULED_TASKS:CREATE',
                fallbackMessage: 'Failed to create scheduled task',
                logContext: { serverId: req.params.id },
            });
        }
    }
);

// GET /api/servers/:id/scheduled-tasks/:taskId
router.get(
    '/:taskId',
    requireServerPermission(PERMISSIONS.scheduledTasks.read),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const taskId = requirePositiveInt(req.params.taskId, 'Invalid scheduled task id');

            const task = await getScheduledTask(serverId, taskId);
            return res.json({ task });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:SCHEDULED_TASKS:GET',
                fallbackMessage: 'Failed to read scheduled task',
                logContext: {
                    serverId: req.params.id,
                    taskId: req.params.taskId,
                },
            });
        }
    }
);

// PATCH /api/servers/:id/scheduled-tasks/:taskId
router.patch(
    '/:taskId',
    requireServerPermission(PERMISSIONS.scheduledTasks.write),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const taskId = requirePositiveInt(req.params.taskId, 'Invalid scheduled task id');
            const body = requireBodyObject(req.body);

            const task = await updateScheduledTask(serverId, taskId, {
                type: body.type,
                schedule: body.schedule,
                enabled: body.enabled,
                payload: body.payload,
            });

            return res.json({ task });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:SCHEDULED_TASKS:PATCH',
                fallbackMessage: 'Failed to update scheduled task',
                logContext: {
                    serverId: req.params.id,
                    taskId: req.params.taskId,
                },
            });
        }
    }
);

// DELETE /api/servers/:id/scheduled-tasks/:taskId
router.delete(
    '/:taskId',
    requireServerPermission(PERMISSIONS.scheduledTasks.write),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const taskId = requirePositiveInt(req.params.taskId, 'Invalid scheduled task id');

            await deleteScheduledTask(serverId, taskId);
            return res.json({ success: true });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:SCHEDULED_TASKS:DELETE',
                fallbackMessage: 'Failed to delete scheduled task',
                logContext: {
                    serverId: req.params.id,
                    taskId: req.params.taskId,
                },
            });
        }
    }
);

export default router;
