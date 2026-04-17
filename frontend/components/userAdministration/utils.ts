export const GLOBAL_OPTIONS = [
  { value: 'users.manage', label: 'Manage users' },
  { value: 'server.install', label: 'Install servers' },
  { value: '*', label: 'Full global access (*)' },
];

export const SERVER_OPTIONS = [
  { value: 'server.edit', label: 'Edit server name' },
  { value: 'server.console', label: 'Access server console' },
  { value: 'server.power', label: 'Power controls (start/stop/restart)' },
  { value: 'server.gamesettings.write', label: 'Manage game update settings' },
  { value: 'server.logs.read', label: 'Read server logs' },
  { value: 'server.delete', label: 'Delete server' },
  { value: 'fs.read', label: 'Read files' },
  { value: 'fs.write', label: 'Write files' },
  { value: 'backups.download', label: 'Download backups' },
  { value: 'backups.create', label: 'Create backups' },
  { value: 'backups.settings.write', label: 'Edit backup settings' },
  { value: 'backups.delete', label: 'Delete backups' },
  { value: 'sftp.manage', label: 'Manage SFTP' },
  { value: 'ssh.terminal', label: 'Use SSH terminal' },
];

export const SERVER_PRESETS = [
  { id: 'viewer', label: 'Viewer', permissions: ['server.console', 'server.logs.read', 'fs.read'] },
  {
    id: 'operator',
    label: 'Operator',
    permissions: [
      'server.edit',
      'server.console',
      'server.logs.read',
      'server.power',
      'server.gamesettings.write',
      'fs.read',
      'fs.write',
      'ssh.terminal',
      'backups.download',
      'backups.create',
    ],
  },
  { id: 'full', label: 'Full access', permissions: ['*'] },
];

export const MAX_USERS = 10;

export const globalPresetValues = new Set(GLOBAL_OPTIONS.map((option) => option.value));
export const serverPresetValues = new Set([...SERVER_OPTIONS.map((option) => option.value), '*']);
const serverPermissionKeys = SERVER_OPTIONS.filter((option) => option.value !== '*').map(
  (option) => option.value
);

export function parsePermissionList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/g)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

export function normalizePermissions(values: string[]): string[] {
  const unique = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (unique.includes('*')) return ['*'];
  return unique;
}

export function stripWildcard(values: string[]): string[] {
  return values.filter((permission) => permission !== '*');
}

export function splitPermissions(values: string[], preset: Set<string>) {
  const known: string[] = [];
  const custom: string[] = [];

  values.forEach((permission) => {
    if (preset.has(permission)) {
      known.push(permission);
      return;
    }

    custom.push(permission);
  });

  return { known, custom };
}

export function togglePermission(values: string[], item: string) {
  if (item === '*') {
    return values.includes('*') ? [] : ['*'];
  }

  if (values.includes(item)) {
    return values.filter((value) => value !== item);
  }

  if (values.includes('*')) {
    return [item];
  }

  return [...values, item];
}

function hasFullServerAccess(values: string[]): boolean {
  return (
    values.includes('*') || serverPermissionKeys.every((permission) => values.includes(permission))
  );
}

export function isServerPermissionChecked(values: string[], item: string): boolean {
  if (item === '*') return hasFullServerAccess(values);
  return values.includes('*') || values.includes(item);
}

export function toggleServerPermission(values: string[], item: string): string[] {
  if (item === '*') {
    return hasFullServerAccess(values) ? [] : ['*'];
  }

  if (values.includes('*')) {
    return serverPermissionKeys.filter((permission) => permission !== item);
  }

  if (values.includes(item)) {
    return values.filter((value) => value !== item);
  }

  const next = [...values, item];
  return serverPermissionKeys.every((permission) => next.includes(permission)) ? ['*'] : next;
}

export function samePermissionSet(a: string[], b: string[]): boolean {
  const left = normalizePermissions(a).slice().sort();
  const right = normalizePermissions(b).slice().sort();

  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}

export function getAccessLevelLabel(permissions: string[]): string {
  const normalized = normalizePermissions(permissions);
  if (normalized.length === 0) return 'No access';
  if (normalized.length === 1 && normalized[0] === '*') return 'Full access';

  const matchedPreset = SERVER_PRESETS.find(
    (preset) => preset.id !== 'full' && samePermissionSet(normalized, preset.permissions)
  );

  return matchedPreset?.label || 'Custom';
}
