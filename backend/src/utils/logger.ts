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

export function logInfo(scope: string, message: string, meta?: ErrorLogMeta): void {
  const prefix = scopeLabel(scope);
  if (meta && Object.keys(meta).length > 0) {
    console.log(prefix, message, meta);
    return;
  }

  console.log(prefix, message);
}

export function logWarn(scope: string, message: string, meta?: ErrorLogMeta): void {
  const prefix = scopeLabel(scope);
  if (meta && Object.keys(meta).length > 0) {
    console.warn(prefix, message, meta);
    return;
  }

  console.warn(prefix, message);
}
