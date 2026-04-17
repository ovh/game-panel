export function parsePositiveIntId(raw: unknown): number | null {
  const value = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
  if (!/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;

  return parsed;
}
