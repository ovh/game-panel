import fs from 'fs';

function readVersionFromPackageJson(): string | null {
  try {
    const raw = fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    const value = typeof parsed.version === 'string' ? parsed.version.trim() : '';
    return value || null;
  } catch {
    return null;
  }
}

export function getAppVersion(): string {
  return readVersionFromPackageJson() ?? '0.0.0-dev';
}
