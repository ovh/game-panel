import type { ServerProvider } from './types.js';

export type RuntimeIdentity = {
    user: string;
    uid: number;
    gid: number;
};

const OVHCLOUD_IDENTITY: RuntimeIdentity = {
    user: 'gameserver',
    uid: 10001,
    gid: 10001,
};

const LINUXGSM_IDENTITY: RuntimeIdentity = {
    user: 'linuxgsm',
    uid: 1000,
    gid: 1000,
};

const USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/i;
const NUMERIC_USER_RE = /^\d{1,10}$/;
const MAX_UNIX_ID = 2_147_483_647;

function positiveUnixId(value: unknown, fieldName: string): number {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > MAX_UNIX_ID) {
        throw Object.assign(new Error(`${fieldName} must be an integer between 0 and ${MAX_UNIX_ID}`), { statusCode: 400 });
    }
    return n;
}

function normalizeUser(value: unknown): string {
    const user = typeof value === 'string' ? value.trim() : '';
    if (USER_RE.test(user)) {
        return user;
    }

    if (NUMERIC_USER_RE.test(user)) {
        positiveUnixId(Number(user), 'runtimeIdentity.user');
        return user;
    }

    throw Object.assign(new Error('runtimeIdentity.user is required and must be a valid Linux username or UID'), { statusCode: 400 });
}

export function getProviderRuntimeIdentity(provider: Exclude<ServerProvider, 'external'>): RuntimeIdentity {
    if (provider === 'linuxgsm') return LINUXGSM_IDENTITY;
    return OVHCLOUD_IDENTITY;
}

export function normalizeExternalRuntimeIdentity(value: unknown): RuntimeIdentity {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw Object.assign(new Error('runtimeIdentity is required for external provider'), { statusCode: 400 });
    }

    const raw = value as Record<string, unknown>;
    return {
        user: normalizeUser(raw.user),
        uid: positiveUnixId(raw.uid, 'runtimeIdentity.uid'),
        gid: positiveUnixId(raw.gid, 'runtimeIdentity.gid'),
    };
}

export function runtimeConfigForIdentity(identity: RuntimeIdentity, terminalWorkdir?: string, execWorkdir?: string): Record<string, unknown> {
    return {
        terminalUser: identity.user,
        ...(terminalWorkdir ? { terminalWorkdir } : {}),
        execUser: identity.user,
        ...(execWorkdir ? { execWorkdir } : {}),
        volumeUid: identity.uid,
        volumeGid: identity.gid,
    };
}
