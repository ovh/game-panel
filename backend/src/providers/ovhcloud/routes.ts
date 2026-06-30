import { Router } from 'express';
import { getKnownOvhcloudAdapters } from './adapters/registry.js';

const router = Router({ mergeParams: true });

for (const adapter of getKnownOvhcloudAdapters()) {
    for (const route of adapter.routes ?? []) {
        // /api/servers/:id/{provider-route}
        router.use(route.path, route.router);
    }
}

export default router;
