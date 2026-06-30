type CronField = {
    values: Set<number>;
    wildcard: boolean;
};

type ParsedCron = {
    minute: CronField;
    hour: CronField;
    dayOfMonth: CronField;
    month: CronField;
    dayOfWeek: CronField;
};

const MONTH_NAMES: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};

const WEEKDAY_NAMES: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
};

function normalizeToken(token: string, names?: Record<string, number>): string {
    const lower = token.toLowerCase();
    if (names && lower in names) return String(names[lower]);
    return token;
}

function parseNumber(value: string, min: number, max: number, names?: Record<string, number>): number {
    const normalized = normalizeToken(value, names);
    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`Invalid cron field value: ${value}`);
    }
    return parsed;
}

function parseField(
    raw: string,
    min: number,
    max: number,
    opts: { names?: Record<string, number>; normalize?: (value: number) => number } = {}
): CronField {
    const field = raw.trim();
    if (!field) throw new Error('Cron field is empty');

    const values = new Set<number>();
    const wildcard = field === '*' || field.startsWith('*/');

    for (const part of field.split(',')) {
        if (!part) throw new Error('Cron field contains an empty list item');

        const [rangePart, stepPart] = part.split('/');
        const maxStep = max - min + 1;
        const step = stepPart === undefined ? 1 : parseNumber(stepPart, 1, maxStep);
        if (step < 1) throw new Error('Cron step must be positive');

        let start: number;
        let end: number;

        if (rangePart === '*') {
            start = min;
            end = max;
        } else if (rangePart.includes('-')) {
            const [rawStart, rawEnd] = rangePart.split('-');
            start = parseNumber(rawStart, min, max, opts.names);
            end = parseNumber(rawEnd, min, max, opts.names);
            if (start > end) throw new Error('Cron range start must be <= end');
        } else {
            start = parseNumber(rangePart, min, max, opts.names);
            end = start;
        }

        for (let value = start; value <= end; value += step) {
            values.add(opts.normalize ? opts.normalize(value) : value);
        }
    }

    return { values, wildcard };
}

export function parseCronExpression(expression: string): ParsedCron {
    const normalized = expression.trim().replace(/\s+/g, ' ');
    const parts = normalized.split(' ');
    if (parts.length !== 5) {
        throw new Error('Cron schedule must contain exactly 5 fields');
    }

    return {
        minute: parseField(parts[0], 0, 59),
        hour: parseField(parts[1], 0, 23),
        dayOfMonth: parseField(parts[2], 1, 31),
        month: parseField(parts[3], 1, 12, { names: MONTH_NAMES }),
        dayOfWeek: parseField(parts[4], 0, 7, {
            names: WEEKDAY_NAMES,
            normalize: (value) => value === 7 ? 0 : value,
        }),
    };
}

export function assertValidCronExpression(expression: string): string {
    const normalized = expression.trim().replace(/\s+/g, ' ');
    parseCronExpression(normalized);
    return normalized;
}

function matchesCron(date: Date, cron: ParsedCron): boolean {
    if (!cron.minute.values.has(date.getMinutes())) return false;
    if (!cron.hour.values.has(date.getHours())) return false;
    if (!cron.month.values.has(date.getMonth() + 1)) return false;

    const domMatches = cron.dayOfMonth.values.has(date.getDate());
    const dowMatches = cron.dayOfWeek.values.has(date.getDay());

    if (cron.dayOfMonth.wildcard && cron.dayOfWeek.wildcard) return true;
    if (cron.dayOfMonth.wildcard) return dowMatches;
    if (cron.dayOfWeek.wildcard) return domMatches;
    return domMatches || dowMatches;
}

export function nextCronRunAt(expression: string, from = new Date()): Date {
    const cron = parseCronExpression(expression);
    const candidate = new Date(from.getTime());
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    const maxIterations = 366 * 24 * 60;
    for (let index = 0; index < maxIterations; index += 1) {
        if (matchesCron(candidate, cron)) return candidate;
        candidate.setMinutes(candidate.getMinutes() + 1);
    }

    throw new Error('Could not compute next cron run within one year');
}
