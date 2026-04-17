type ErrorLogMeta = Record<string, unknown> | undefined;

function scopeLabel(scope: string): string {
  const normalized = String(scope || 'APP').trim().toUpperCase();
  return `[${normalized}]`;
}

export function logError(scope: string, error: unknown, meta?: ErrorLogMeta): void {
  const prefix = scopeLabel(scope);
  if (meta && Object.keys(meta).length > 0) {
    console.error(prefix, meta, error);
    return;
  }

  console.error(prefix, error);
}
