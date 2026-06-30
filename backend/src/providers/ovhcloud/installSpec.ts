import { normalizeDockerImage } from '../installPayload.js';
import type { ProviderInstallContext, ResolvedInstallSpec } from '../installTypes.js';
import { getProviderRuntimeIdentity, runtimeConfigForIdentity } from '../runtimeIdentity.js';
import { getOvhcloudImageAdapter } from './adapters/registry.js';

const IMAGE_ID_RE = /^[a-z0-9][a-z0-9._-]{1,127}$/i;

function normalizeImageId(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const imageId = value.trim();
    return IMAGE_ID_RE.test(imageId) ? imageId : null;
}

export function resolveOvhcloudInstallSpec(ctx: ProviderInstallContext): ResolvedInstallSpec {
    const imageId = normalizeImageId(ctx.body.imageId ?? ctx.body.catalogId);
    if (!imageId) {
        throw Object.assign(new Error('Missing or invalid OVHcloud imageId'), { statusCode: 400 });
    }

    const dockerImage = normalizeDockerImage(ctx.body.dockerImage);
    if (!dockerImage) {
        throw Object.assign(new Error('Missing or invalid dockerImage'), { statusCode: 400 });
    }

    const runtimeIdentity = getProviderRuntimeIdentity('ovhcloud');
    const imageAdapter = getOvhcloudImageAdapter(imageId);
    const resolvedImage = imageAdapter.resolveInstall(ctx, imageId);

    return {
        provider: 'ovhcloud',
        catalogId: imageId,
        dockerImage,
        ports: ctx.ports,
        healthcheck: ctx.healthcheck,
        resourceLimits: ctx.resourceLimits,
        mounts: resolvedImage.mounts,
        env: resolvedImage.env,
        runtimeIdentity,
        runtimeConfig: runtimeConfigForIdentity(runtimeIdentity, '/data', '/app'),
        providerMetadata: resolvedImage.providerMetadata,
        steamCredentials: null,
    };
}
