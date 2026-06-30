export function asOptionalString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

export function normalizeDockerImage(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const image = value.trim();
    if (!image || image.length > 255) return null;
    if (/[\s"'`$\\]/.test(image)) return null;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(image)) return null;
    return image;
}

export function normalizeEnvPayload(value: unknown): string[] {
    if (value === undefined || value === null) return [];

    if (Array.isArray(value)) {
        return value.map((entry, index) => {
            if (typeof entry !== 'string') {
                throw new Error(`env[${index}] must be a string`);
            }

            if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(entry)) {
                throw new Error(`env[${index}] must use KEY=value format`);
            }

            return entry;
        });
    }

    if (typeof value !== 'object') {
        throw new Error('env must be an object or array');
    }

    return Object.entries(value as Record<string, unknown>).map(([key, rawValue]) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            throw new Error(`Invalid env key: ${key}`);
        }
        return `${key}=${String(rawValue ?? '')}`;
    });
}
