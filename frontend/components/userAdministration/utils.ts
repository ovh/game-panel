export const GLOBAL_OPTIONS = [
  { value: 'users.manage', label: 'Manage users' },
  { value: 'server.install', label: 'Install servers' },
  { value: '*', label: 'Full global access (*)' },
];

// General permissions are ordered from least to most dangerous (the filtered
// SERVER_GENERAL_OPTIONS keeps this order for display).
export const SERVER_CORE_OPTIONS = [
  { value: 'server.power', label: 'Start/Stop/Restart' },
  { value: 'container.logs.read', label: 'Read server logs' },
  { value: 'server.command.send', label: 'Access server console' },
  { value: 'server.edit', label: 'Edit container properties' },
  { value: 'server.env', label: 'Manage environment variables' },
  { value: 'container.terminal', label: 'Access container terminal' },
  { value: 'server.delete', label: 'Delete server' },
  { value: 'scheduledtasks.read', label: 'View scheduled tasks' },
  { value: 'scheduledtasks.write', label: 'Manage scheduled tasks' },
  { value: 'fs.read', label: 'Read files' },
  { value: 'fs.write', label: 'Write files' },
];

export const SERVER_GENERAL_OPTIONS = SERVER_CORE_OPTIONS.filter((o) =>
  !['fs.read', 'fs.write', 'scheduledtasks.read', 'scheduledtasks.write'].includes(o.value)
);

export const FILE_MANAGER_OPTIONS = [
  { value: 'fs.read', label: 'Read files' },
  { value: 'fs.write', label: 'Write files' },
];

export const SCHEDULED_TASKS_OPTIONS = [
  { value: 'scheduledtasks.read', label: 'View scheduled tasks' },
  { value: 'scheduledtasks.write', label: 'Manage scheduled tasks' },
];

export const BACKUP_OPTIONS = [
  { value: 'backups.read', label: 'View backups' },
  { value: 'backups.create', label: 'Create backups' },
  { value: 'backups.restore', label: 'Restore backups' },
  { value: 'backups.download', label: 'Download backups' },
  { value: 'backups.delete', label: 'Delete backups' },
  { value: 'backups.rename', label: 'Rename backups' },
  { value: 'backups.settings.write', label: 'Edit backup settings' },
];

export const SERVER_OPTIONS = [...SERVER_CORE_OPTIONS, ...BACKUP_OPTIONS];

export const CS2_OVHCLOUD_OPTIONS = [
  { value: 'cs2.frameworks.write', label: 'Manage frameworks' },
];

export const MINECRAFT_OVHCLOUD_OPTIONS = [
  { value: 'minecraft.settings.read', label: 'View game config' },
  { value: 'minecraft.settings.write', label: 'Edit game config' },
  { value: 'minecraft.operators.read', label: 'View operators' },
  { value: 'minecraft.operators.write', label: 'Manage operators' },
  { value: 'minecraft.whitelist.read', label: 'View whitelist' },
  { value: 'minecraft.whitelist.write', label: 'Manage whitelist' },
  { value: 'minecraft.bans.read', label: 'View player bans' },
  { value: 'minecraft.bans.write', label: 'Manage player bans' },
  { value: 'minecraft.ip-bans.read', label: 'View IP bans' },
  { value: 'minecraft.ip-bans.write', label: 'Manage IP bans' },
  { value: 'minecraft.addons.read', label: 'View mods / plugins' },
  { value: 'minecraft.addons.write', label: 'Manage mods / plugins' },
];

export const HYTALE_OVHCLOUD_OPTIONS = [
  { value: 'hytale.settings.read', label: 'View game config' },
  { value: 'hytale.settings.write', label: 'Edit game config' },
  { value: 'hytale.mods.read', label: 'View mods' },
  { value: 'hytale.mods.write', label: 'Manage mods' },
];

// Canonical set of per-server permissions the backend will accept for a member
// (POST/PATCH /api/servers/:id/members). It mirrors backend/src/permissions.ts
// minus the global-only `users.manage` / `server.install`, and must NOT contain
// the `*` wildcard — the backend now rejects `*` and any unknown string with a
// 400. Derived from the option arrays above so it stays in sync with the picker.
export const ASSIGNABLE_SERVER_PERMISSIONS: string[] = [
  ...SERVER_OPTIONS,
  ...CS2_OVHCLOUD_OPTIONS,
  ...MINECRAFT_OVHCLOUD_OPTIONS,
  ...HYTALE_OVHCLOUD_OPTIONS,
].map((option) => option.value);

export const SERVER_PRESETS = [
  {
    id: 'viewer',
    label: 'Viewer',
    permissions: [
      'server.command.send',
      'container.logs.read',
      'fs.read',
      'backups.read',
      'scheduledtasks.read',
    ],
  },
  {
    id: 'operator',
    label: 'Operator',
    permissions: [
      'server.edit',
      'server.command.send',
      'container.logs.read',
      'server.power',
      'server.env',
      'fs.read',
      'fs.write',
      'container.terminal',
      'backups.read',
      'backups.download',
      'backups.create',
      'scheduledtasks.read',
    ],
  },
  // Full access = every assignable per-server permission, listed explicitly.
  // (Previously this sent `['*']`, which the backend now rejects.)
  { id: 'full', label: 'Full access', permissions: [...ASSIGNABLE_SERVER_PERMISSIONS] },
];

const BASE_VIEWER = [
  'server.command.send', 'container.logs.read', 'fs.read',
  'backups.read', 'scheduledtasks.read',
];
const BASE_OPERATOR = [
  'server.edit', 'server.command.send', 'container.logs.read', 'server.power', 'server.env',
  'fs.read', 'fs.write', 'container.terminal',
  'backups.read', 'backups.download', 'backups.create', 'scheduledtasks.read',
];

export const MINECRAFT_PRESETS = [
  {
    id: 'minecraft-viewer',
    label: 'Minecraft Viewer',
    permissions: [
      ...BASE_VIEWER,
      'minecraft.settings.read', 'minecraft.operators.read',
      'minecraft.whitelist.read', 'minecraft.bans.read',
      'minecraft.ip-bans.read', 'minecraft.addons.read',
    ],
  },
  {
    id: 'minecraft-operator',
    label: 'Minecraft Operator',
    permissions: [
      ...BASE_OPERATOR,
      'minecraft.settings.read', 'minecraft.settings.write',
      'minecraft.operators.read', 'minecraft.operators.write',
      'minecraft.whitelist.read', 'minecraft.whitelist.write',
      'minecraft.bans.read', 'minecraft.bans.write',
      'minecraft.ip-bans.read', 'minecraft.ip-bans.write',
      'minecraft.addons.read', 'minecraft.addons.write',
    ],
  },
];

export const HYTALE_PRESETS = [
  {
    id: 'hytale-viewer',
    label: 'Hytale Viewer',
    permissions: [
      ...BASE_VIEWER,
      'hytale.settings.read', 'hytale.mods.read',
    ],
  },
  {
    id: 'hytale-operator',
    label: 'Hytale Operator',
    permissions: [
      ...BASE_OPERATOR,
      'hytale.settings.read', 'hytale.settings.write',
      'hytale.mods.read', 'hytale.mods.write',
    ],
  },
];

export const CS2_PRESETS = [
  {
    id: 'cs2-operator',
    label: 'CS2 Operator',
    permissions: [
      // CS2 ne gère pas les backups : on retire backups.* du preset.
      ...BASE_OPERATOR.filter((p) => !p.startsWith('backups.')),
      'cs2.frameworks.write',
    ],
  },
];

export const ALL_PRESETS = [...SERVER_PRESETS, ...MINECRAFT_PRESETS, ...HYTALE_PRESETS, ...CS2_PRESETS];

export const MAX_USERS = 10;

export const globalPresetValues = new Set(GLOBAL_OPTIONS.map((option) => option.value));
export const serverPresetValues = new Set([
  ...SERVER_OPTIONS.map((option) => option.value),
  ...CS2_OVHCLOUD_OPTIONS.map((option) => option.value),
  ...MINECRAFT_OVHCLOUD_OPTIONS.map((option) => option.value),
  ...HYTALE_OVHCLOUD_OPTIONS.map((option) => option.value),
  '*',
]);
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
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function stripWildcard(values: string[]): string[] {
  return values.filter((permission) => permission !== '*');
}

// Final guard before sending per-server permissions to the backend: expand any
// legacy `*` to the explicit canonical list and drop anything that is not an
// assignable per-server permission. The backend rejects `*` / unknown strings
// with a 400, so this keeps stale data (e.g. members saved before this change)
// from blocking an otherwise valid save.
export function sanitizeServerPermissions(values: string[]): string[] {
  const expanded = values.includes('*') ? [...ASSIGNABLE_SERVER_PERMISSIONS] : values;
  const assignable = new Set(ASSIGNABLE_SERVER_PERMISSIONS);
  return Array.from(new Set(expanded.filter((permission) => assignable.has(permission))));
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
    // `*` is only ever read here for backward-compatibility with data saved
    // before the wildcard was removed; it is never written back.
    values.includes('*') ||
    ASSIGNABLE_SERVER_PERMISSIONS.every((permission) => values.includes(permission))
  );
}

export function isServerPermissionChecked(values: string[], item: string): boolean {
  if (item === '*') return hasFullServerAccess(values);
  return values.includes('*') || values.includes(item);
}

export function toggleServerPermission(values: string[], item: string): string[] {
  // Expand any legacy `*` to the explicit list first so toggling never has to
  // reason about the wildcard, and so we never emit `*` back to the backend.
  const base = values.includes('*') ? [...ASSIGNABLE_SERVER_PERMISSIONS] : values;

  if (item === '*') {
    return hasFullServerAccess(base) ? [] : [...ASSIGNABLE_SERVER_PERMISSIONS];
  }

  if (base.includes(item)) {
    return base.filter((value) => value !== item);
  }

  return [...base, item];
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
  // Full access is now the explicit canonical list (legacy `*` still recognised).
  if (hasFullServerAccess(normalized)) return 'Full access';

  const matchedPreset = SERVER_PRESETS.find(
    (preset) => preset.id !== 'full' && samePermissionSet(normalized, preset.permissions)
  );

  return matchedPreset?.label || 'Custom';
}
