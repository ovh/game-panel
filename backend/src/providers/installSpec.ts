import type { ProviderInstallContext, ResolvedInstallSpec } from './installTypes.js';
import { resolveExternalInstallSpec } from './external/installSpec.js';
import { resolveLinuxGsmInstallSpec } from './linuxgsm/installSpec.js';
import { resolveOvhcloudInstallSpec } from './ovhcloud/installSpec.js';
import type { ServerProvider } from './types.js';

export async function resolveInstallSpec(params: ProviderInstallContext & {
    provider: ServerProvider;
}): Promise<ResolvedInstallSpec> {
    if (params.provider === 'linuxgsm') {
        return resolveLinuxGsmInstallSpec(params);
    }

    if (params.provider === 'external') {
        return resolveExternalInstallSpec(params);
    }

    return resolveOvhcloudInstallSpec(params);
}
