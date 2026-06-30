import type { NormalizedHealthcheck } from '../utils/healthcheck.js';
import type { NormalizedMount } from '../utils/mounts.js';
import type { NormalizedPorts } from '../utils/ports.js';
import type { NormalizedResourceLimits } from '../utils/resourceLimits.js';
import type { ServerProvider } from './types.js';
import type { SteamCredentials } from './linuxgsm/adapters/types.js';
import type { RuntimeIdentity } from './runtimeIdentity.js';

export type ProviderInstallContext = {
    body: Record<string, unknown>;
    ports: NormalizedPorts;
    healthcheck: NormalizedHealthcheck | null;
    resourceLimits: NormalizedResourceLimits;
    steamCredentials: SteamCredentials | null;
};

export type ResolvedInstallSpec = {
    provider: ServerProvider;
    catalogId: string | null;
    dockerImage: string;
    ports: NormalizedPorts;
    healthcheck: NormalizedHealthcheck | null;
    resourceLimits: NormalizedResourceLimits;
    mounts: NormalizedMount[];
    env: string[];
    runtimeIdentity: RuntimeIdentity;
    runtimeConfig: Record<string, unknown>;
    providerMetadata: Record<string, unknown>;
    steamCredentials: SteamCredentials | null;
};
