export const SERVER_PROVIDERS = ['linuxgsm', 'ovhcloud', 'external'] as const;

export type ServerProvider = typeof SERVER_PROVIDERS[number];

export type OvhcloudProviderMetadata = {
    imageId: string;
    family?: string;
    edition?: string;
    serverType?: string;
    javaVersion?: number | null;
    patchline?: string;
    profileUuid?: string | null;
    capabilities?: Record<string, unknown>;
};

export type LinuxGsmProviderMetadata = {
    shortname: string;
    gameservername: string;
    gamename: string;
    os: string | null;
};

export type ExternalProviderMetadata = {
    userProvided: true;
};

export type ProviderMetadata =
    | OvhcloudProviderMetadata
    | LinuxGsmProviderMetadata
    | ExternalProviderMetadata;

export function normalizeServerProvider(value: unknown): ServerProvider | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return SERVER_PROVIDERS.includes(normalized as ServerProvider)
        ? (normalized as ServerProvider)
        : null;
}
