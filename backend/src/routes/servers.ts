import { Router } from 'express';
import serverFileRoutes from './serverFile.js';
import serverFilesRoutes from './serverFiles.js';
import backupsRoutes from './backups.js';
import terminalRoutes from './terminal.js';
import scheduledTasksRoutes from './scheduledTasks.js';
import consoleRoutes from './console.js';
import ovhcloudRoutes from '../providers/ovhcloud/routes.js';
import { createServerDeleteRoutes } from './servers/delete.js';
import { createServerInstallRoutes } from './servers/install.js';
import { createServerInteractionRoutes } from './servers/interactions.js';
import { createServerPatchRoutes } from './servers/patch.js';
import { createServerPowerRoutes } from './servers/power.js';
import { createServerReadRoutes } from './servers/read.js';

const router = Router();

// /api/servers/:id/file
router.use('/:id/file', serverFileRoutes);
// /api/servers/:id/files
router.use('/:id/files', serverFilesRoutes);
// /api/servers/:id/backups
router.use('/:id/backups', backupsRoutes);
// /api/servers/:id/terminal
router.use('/:id/terminal', terminalRoutes);
// /api/servers/:id/console
router.use('/:id/console', consoleRoutes);
// /api/servers/:id/scheduled-tasks
router.use('/:id/scheduled-tasks', scheduledTasksRoutes);

// /api/servers
router.use('/', createServerReadRoutes());
// POST /api/servers/install
router.use('/', createServerInstallRoutes());
// PATCH /api/servers/:id
router.use('/', createServerPatchRoutes());
// POST /api/servers/:id/start|stop|restart
router.use('/', createServerPowerRoutes());
// POST /api/servers/:id/install/interactions/:interactionId/respond
router.use('/', createServerInteractionRoutes());
// DELETE /api/servers/:id
router.use('/', createServerDeleteRoutes());

// /api/servers/:id/{provider-route}
router.use('/:id', ovhcloudRoutes);

export default router;
