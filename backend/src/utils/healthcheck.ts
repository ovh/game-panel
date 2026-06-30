export type HealthcheckPayload =
    | null
    | undefined
    | {
        mode: 'override';
        type?: 'tcp_connect';
        port?: number;
        intervalSeconds?: number;
        timeoutSeconds?: number;
        startPeriodSeconds?: number;
        retries?: number;
    }
    | {
        mode: 'override';
        type?: 'process';
        name?: string;
        intervalSeconds?: number;
        timeoutSeconds?: number;
        startPeriodSeconds?: number;
        retries?: number;
    }
    | {
        mode: 'override';
        type?: 'command';
        command?: string[];
        intervalSeconds?: number;
        timeoutSeconds?: number;
        startPeriodSeconds?: number;
        retries?: number;
    }
    | {
        mode: 'image_default' | 'disabled';
    };

export type NormalizedHealthcheck =
    | { mode: 'disabled' }
    | {
        mode: 'override';
        probe:
        | { type: 'tcp_connect'; port: number }
        | { type: 'process'; name: string }
        | { type: 'command'; command: string[] };
        intervalSeconds: number;
        timeoutSeconds: number;
        startPeriodSeconds: number;
        retries: number;
    };

function positiveInt(value: unknown, fieldName: string, opts: { min?: number; max?: number } = {}): number {
    const n = Number(value);
    const min = opts.min ?? 1;
    const max = opts.max ?? Number.MAX_SAFE_INTEGER;

    if (!Number.isInteger(n) || n < min || n > max) {
        throw new Error(`${fieldName} must be an integer between ${min} and ${max}`);
    }

    return n;
}

function requireField(payload: Record<string, unknown>, key: string): unknown {
    if (!(key in payload) || payload[key] === undefined || payload[key] === null) {
        throw new Error(`healthcheck.${key} is required when mode is override`);
    }

    return payload[key];
}

function normalizeTiming(payload: Record<string, unknown>): Pick<
    Extract<NormalizedHealthcheck, { mode: 'override' }>,
    'intervalSeconds' | 'timeoutSeconds' | 'startPeriodSeconds' | 'retries'
> {
    return {
        intervalSeconds: positiveInt(requireField(payload, 'intervalSeconds'), 'healthcheck.intervalSeconds', { max: 86400 }),
        timeoutSeconds: positiveInt(requireField(payload, 'timeoutSeconds'), 'healthcheck.timeoutSeconds', { max: 86400 }),
        startPeriodSeconds: positiveInt(requireField(payload, 'startPeriodSeconds'), 'healthcheck.startPeriodSeconds', { min: 0, max: 86400 }),
        retries: positiveInt(requireField(payload, 'retries'), 'healthcheck.retries', { max: 100 }),
    };
}

export function normalizeHealthcheckPayload(payload?: HealthcheckPayload): NormalizedHealthcheck | null {
    if (payload === undefined || payload === null) return null;
    if (typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('healthcheck must be an object or null');
    }

    const raw = payload as Record<string, unknown>;
    const mode = typeof raw.mode === 'string' ? raw.mode : undefined;
    const type = typeof raw.type === 'string' ? raw.type : undefined;

    if (mode === 'image_default') return null;
    if (mode === 'disabled') return { mode: 'disabled' };

    if (mode !== 'override') {
        throw new Error(`Unsupported healthcheck mode: ${mode}`);
    }

    if (!type) throw new Error('healthcheck.type is required when mode is override');

    const timing = normalizeTiming(raw);

    if (type === 'tcp_connect') {
        const port = positiveInt(requireField(raw, 'port'), 'healthcheck.port', { min: 1, max: 65535 });
        return { mode: 'override', probe: { type, port }, ...timing };
    }

    if (type === 'process') {
        const rawName = requireField(raw, 'name');
        const name = typeof rawName === 'string' ? rawName.trim() : '';
        if (!name) throw new Error('healthcheck.name must be a non-empty string');
        return { mode: 'override', probe: { type, name }, ...timing };
    }

    if (type === 'command') {
        const rawCommand = requireField(raw, 'command');
        const command = Array.isArray(rawCommand)
            ? rawCommand.filter((part): part is string => typeof part === 'string' && part.length > 0)
            : [];
        if (command.length === 0 || command.length !== (rawCommand as unknown[]).length) {
            throw new Error('healthcheck.command must be a non-empty string array');
        }
        return { mode: 'override', probe: { type, command }, ...timing };
    }

    throw new Error(`Unsupported healthcheck type: ${type}`);
}
