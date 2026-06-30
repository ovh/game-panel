export type MountsPayload = Array<{
    key?: unknown;
    containerPath?: unknown;
}>;

export type NormalizedMount = {
    key: string;
    containerPath: string;
};

const MOUNT_KEY_RE = /^[a-zA-Z0-9_-]{1,40}$/;

function normalizeContainerPath(value: unknown): string {
    if (typeof value !== 'string') throw new Error('mount.containerPath must be a string');
    const normalized = value.trim();

    if (!normalized.startsWith('/')) {
        throw new Error('mount.containerPath must be an absolute container path');
    }
    if (normalized === '/') {
        throw new Error('mount.containerPath cannot be /');
    }
    if (normalized.includes('\0') || normalized.includes('\n') || normalized.includes('\r')) {
        throw new Error('mount.containerPath contains invalid characters');
    }

    return normalized.replace(/\/+$/, '') || normalized;
}

export function normalizeMountsPayload(payload: unknown): NormalizedMount[] | null {
    if (payload === undefined || payload === null) return null;
    if (!Array.isArray(payload)) throw new Error('mounts must be an array');

    const keys = new Set<string>();
    const paths = new Set<string>();
    const mounts: NormalizedMount[] = [];

    for (const raw of payload as MountsPayload) {
        if (!raw || typeof raw !== 'object') throw new Error('mount entry must be an object');

        const key = typeof raw.key === 'string' ? raw.key.trim() : '';
        if (!MOUNT_KEY_RE.test(key)) {
            throw new Error('mount.key must contain only letters, numbers, _ or - and be 1..40 chars');
        }

        const containerPath = normalizeContainerPath(raw.containerPath);
        if (keys.has(key)) throw new Error(`Duplicate mount key: ${key}`);
        if (paths.has(containerPath)) throw new Error(`Duplicate mount containerPath: ${containerPath}`);

        keys.add(key);
        paths.add(containerPath);
        mounts.push({
            key,
            containerPath,
        });
    }

    return mounts;
}
