export function nowIso(): string {
  return new Date().toISOString();
}

export function secondsAgoIso(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return new Date(Date.now() - safeSeconds * 1000).toISOString();
}

export function daysAgoIso(days: number): string {
  const safeDays = Number.isFinite(days) ? Math.max(0, days) : 0;
  return new Date(Date.now() - safeDays * 24 * 60 * 60_000).toISOString();
}

function parseTimestampMs(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return NaN;

  const sqliteLikeWithOffset = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{4})$/.exec(trimmed);
  if (sqliteLikeWithOffset) {
    const [, date, time, offset] = sqliteLikeWithOffset;
    const normalizedOffset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
    const parsed = Date.parse(`${date}T${time}${normalizedOffset}`);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (!trimmed.includes('T') && trimmed.includes(' ')) {
    const sqliteLike = `${trimmed.replace(' ', 'T')}Z`;
    const sqliteMs = Date.parse(sqliteLike);
    if (Number.isFinite(sqliteMs)) return sqliteMs;
  }

  return Date.parse(trimmed);
}

export function toIsoTimestampIfValid(input?: string | number | Date | null): string | null {
  if (typeof input === 'string') {
    const parsed = parseTimestampMs(input);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }

  if (typeof input === 'number') {
    return Number.isFinite(input) ? new Date(input).toISOString() : null;
  }

  if (input instanceof Date) {
    const ms = input.getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  return null;
}

export function toIsoTimestamp(input?: string | number | Date | null): string {
  return toIsoTimestampIfValid(input) ?? nowIso();
}

export function toIsoTimestampOrNull(input?: string | number | Date | null): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input === 'string' && !input.trim()) return null;
  return toIsoTimestamp(input);
}
