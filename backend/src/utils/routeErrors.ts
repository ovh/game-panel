import type { Response } from 'express';
import { logError } from './logger.js';

export function getErrorStatusCode(error: unknown, fallback = 500): number {
    const statusCode = Number((error as { statusCode?: unknown })?.statusCode);
    return Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599
        ? statusCode
        : fallback;
}

export function getPublicErrorMessage(error: unknown, fallbackMessage: string): string {
    const statusCode = getErrorStatusCode(error);
    if (statusCode >= 500) return fallbackMessage;
    return error instanceof Error ? error.message : fallbackMessage;
}

export async function sendRouteError(
    res: Response,
    error: unknown,
    context: {
        route: string;
        fallbackMessage: string;
        logContext?: Record<string, unknown>;
        onServerError?: () => void | Promise<void>;
    }
) {
    const statusCode = getErrorStatusCode(error);
    const message = getPublicErrorMessage(error, context.fallbackMessage);

    if (statusCode >= 500) {
        logError(context.route, error, context.logContext);
        await context.onServerError?.();
    }

    return res.status(statusCode).json({ error: message });
}
