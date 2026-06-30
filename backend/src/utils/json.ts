export function parseJsonObject<T extends Record<string, unknown>>(
    raw: unknown,
    fallback: T
): T {
    if (typeof raw !== 'string' || raw.trim() === '') return fallback;

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as T;
        }
    } catch {
        return fallback;
    }

    return fallback;
}

export function parseJsonArray<T>(raw: unknown, fallback: T[]): T[] {
    if (typeof raw !== 'string' || raw.trim() === '') return fallback;

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as T[];
    } catch {
        return fallback;
    }

    return fallback;
}

