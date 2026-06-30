import { parsePositiveIntId } from './ids.js';

function badRequest(message: string): never {
    throw Object.assign(new Error(message), { statusCode: 400 });
}

export function requirePositiveInt(value: unknown, message: string): number {
    const parsed = parsePositiveIntId(value);
    if (!parsed) badRequest(message);
    return parsed;
}

export function requireBodyObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        badRequest('Request body must be an object');
    }

    return value as Record<string, unknown>;
}

export function requireRecord(value: unknown, message: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) badRequest(message);
    return value as Record<string, unknown>;
}

export function optionalTrimmedString(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

export function requireTrimmedString(value: unknown, message: string): string {
    const parsed = optionalTrimmedString(value);
    if (!parsed) badRequest(message);
    return parsed;
}

export function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

export function requireString(value: unknown, message: string): string {
    if (typeof value !== 'string') badRequest(message);
    return value;
}

export function optionalQueryString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

export function queryString(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
}

export function optionalBoolean(value: unknown, message: string): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    badRequest(message);
}

export function optionalNumber(value: unknown, message: string): number | undefined {
    if (value === undefined || value === null) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) badRequest(message);
    return parsed;
}

export function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

export function stringArray(value: unknown, message: string): string[] {
    if (!Array.isArray(value)) badRequest(message);

    const values = value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);

    if (values.length !== value.length) badRequest(message);
    return values;
}

export function contentLengthHeader(value: string | string[] | undefined): number {
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number.parseInt(String(raw ?? '0'), 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
