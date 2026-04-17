export interface AuthUser {
  id: number;
  username: string;
  isRoot: boolean;
  isEnabled: boolean;
}

interface ServerPermissionEntry {
  serverId: number;
  permissions: string[];
}

export interface AuthPermissions {
  global: string[];
  servers: ServerPermissionEntry[];
}

const normalizeList = (values: string[] | undefined | null): string[] =>
  Array.from(new Set((values || []).filter(Boolean)));

export const normalizeAuthPermissions = (
  permissions: Partial<AuthPermissions> | null | undefined
): AuthPermissions => ({
  global: normalizeList(permissions?.global as string[]),
  servers: Array.isArray(permissions?.servers)
    ? permissions!.servers
        .map((entry) => ({
          serverId: Number(entry?.serverId),
          permissions: normalizeList(entry?.permissions || []),
        }))
        .filter((entry) => Number.isFinite(entry.serverId) && entry.serverId > 0)
    : [],
});

export const hasGlobalPermission = (
  user: Pick<AuthUser, 'isRoot'> | null | undefined,
  permissions: AuthPermissions | null | undefined,
  permission: string
): boolean => {
  if (user?.isRoot) return true;
  const global = permissions?.global || [];
  return global.includes('*') || global.includes(permission);
};

const getServerPermissions = (
  permissions: AuthPermissions | null | undefined,
  serverId: number
): string[] => {
  const match = permissions?.servers?.find((entry) => entry.serverId === serverId);
  return match?.permissions || [];
};

export const hasServerPermission = (
  user: Pick<AuthUser, 'isRoot'> | null | undefined,
  permissions: AuthPermissions | null | undefined,
  serverId: number,
  permission: string
): boolean => {
  if (user?.isRoot) return true;
  if (hasGlobalPermission(user, permissions, '*')) return true;
  const serverPermissions = getServerPermissions(permissions, serverId);
  return serverPermissions.includes('*') || serverPermissions.includes(permission);
};
