export function nowIso(): string {
  return new Date().toISOString();
}

export function toIsoTimestamp(input?: string | number | Date | null): string {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return nowIso();

    if (!trimmed.includes('T') && trimmed.includes(' ')) {
      const sqliteLike = `${trimmed.replace(' ', 'T')}Z`;
      const sqliteMs = Date.parse(sqliteLike);
      if (Number.isFinite(sqliteMs)) return new Date(sqliteMs).toISOString();
    }

    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    return nowIso();
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return nowIso();
    return new Date(input).toISOString();
  }

  if (input instanceof Date) {
    const ms = input.getTime();
    if (!Number.isFinite(ms)) return nowIso();
    return new Date(ms).toISOString();
  }

  return nowIso();
}
