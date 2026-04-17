const decodeFilename = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const getPathFilename = (path: string, fallback: string): string =>
  path.split('/').filter(Boolean).pop() || fallback;

export const getFilenameFromDisposition = (
  disposition: string | undefined,
  fallback: string
): string => {
  if (!disposition) return fallback;

  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  const rawFilename = match?.[1] || match?.[2];
  if (!rawFilename) return fallback;

  return decodeFilename(rawFilename);
};
