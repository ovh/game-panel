function readVersionFromPackageJson(): string | null {
  const value = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.trim() : '';
  return value || null;
}

export function getAppVersion(): string {
  return readVersionFromPackageJson() ?? '0.0.0-dev';
}
