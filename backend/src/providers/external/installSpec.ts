import { normalizeMountsPayload } from '../../utils/mounts.js';
import { normalizeDockerImage, normalizeEnvPayload } from '../installPayload.js';
import type { ProviderInstallContext, ResolvedInstallSpec } from '../installTypes.js';
import { normalizeExternalRuntimeIdentity, runtimeConfigForIdentity } from '../runtimeIdentity.js';

export function resolveExternalInstallSpec(ctx: ProviderInstallContext): ResolvedInstallSpec {
    const dockerImage = normalizeDockerImage(ctx.body.dockerImage);
    if (!dockerImage) {
        throw Object.assign(new Error('Missing or invalid dockerImage'), { statusCode: 400 });
    }
    const runtimeIdentity = normalizeExternalRuntimeIdentity(ctx.body.runtimeIdentity);

    return {
        provider: 'external',
        catalogId: null,
        dockerImage,
        ports: ctx.ports,
        healthcheck: ctx.healthcheck,
        resourceLimits: ctx.resourceLimits,
        mounts: normalizeMountsPayload(ctx.body.mounts) ?? [],
        env: normalizeEnvPayload(ctx.body.env),
        runtimeIdentity,
        runtimeConfig: runtimeConfigForIdentity(runtimeIdentity),
        providerMetadata: {
            userProvided: true,
        },
        steamCredentials: null,
    };
}
