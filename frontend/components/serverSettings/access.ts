import type { AuthUser } from '../../utils/permissions';

export type SettingsTab = 'filemanager' | 'backup' | 'gameconfig' | 'terminal' | 'containerconfig' | 'scheduledtasks';

export const SETTINGS_TAB_PRIORITY: SettingsTab[] = [
  'gameconfig',
  'filemanager',
  'backup',
  'terminal',
  'containerconfig',
  'scheduledtasks',
];

export interface ServerSettingsAccess {
  canUseFileManager: boolean;
  canUseTerminal: boolean;
  canUseGameConfig: boolean;
  canUseGameConfigTab: boolean;
  canUseBackup: boolean;
  canReadBackups: boolean;
  canReadScheduledTasks: boolean;
  canEditContainerConfig: boolean;
  canManageEnv: boolean;
  hasAnySettingsAccess: boolean;
  canWriteFiles: boolean;
  canDownloadBackups: boolean;
  canCreateBackups: boolean;
  canEditBackupSettings: boolean;
  canDeleteBackups: boolean;
  canRestoreBackups: boolean;
  canRenameBackups: boolean;
  canWriteScheduledTasks: boolean;
  // Minecraft Java
  canReadMinecraftSettings: boolean;
  canWriteMinecraftSettings: boolean;
  canReadMinecraftOperators: boolean;
  canWriteMinecraftOperators: boolean;
  canReadMinecraftWhitelist: boolean;
  canWriteMinecraftWhitelist: boolean;
  canReadMinecraftBans: boolean;
  canWriteMinecraftBans: boolean;
  canReadMinecraftIpBans: boolean;
  canWriteMinecraftIpBans: boolean;
  canReadMinecraftAddons: boolean;
  canWriteMinecraftAddons: boolean;
  canUseMinecraft: boolean;
  // Hytale
  canReadHytaleSettings: boolean;
  canWriteHytaleSettings: boolean;
  canReadHytaleMods: boolean;
  canWriteHytaleMods: boolean;
  canUseHytale: boolean;
  // CS2
  canWriteCS2Frameworks: boolean;
  canAccessTab: (tab: SettingsTab) => boolean;
}

export function createServerSettingsAccess(
  currentUser: AuthUser | null | undefined,
  serverPermissions: string[]
): ServerSettingsAccess {
  const hasServerPermission = (permission: string) => {
    if (currentUser?.isRoot) return true;
    return serverPermissions.includes('*') || serverPermissions.includes(permission);
  };

  const canUseFileManager = hasServerPermission('fs.read');
  const canUseTerminal = hasServerPermission('container.terminal');
  const canUseGameConfig = canUseFileManager;
  const canUseGameConfigTab = canUseGameConfig;
  const canReadBackups = hasServerPermission('backups.read');
  const canUseBackup =
    canReadBackups ||
    hasServerPermission('backups.download') ||
    hasServerPermission('backups.create') ||
    hasServerPermission('backups.settings.write') ||
    hasServerPermission('backups.delete') ||
    hasServerPermission('backups.rename');
  const canEditContainerConfig = hasServerPermission('server.edit');
  // Environment variables can hold secrets (RCON passwords, tokens, …) so they
  // are gated behind a dedicated `server.env` permission, on top of the
  // `server.edit` needed to open the container config at all. The backend
  // redacts `env` (returns `{}`) and silently ignores it in PATCH for callers
  // that lack this permission.
  const canManageEnv = hasServerPermission('server.env');
  const canWriteFiles = hasServerPermission('fs.write');
  const canDownloadBackups = hasServerPermission('backups.download');
  const canCreateBackups = hasServerPermission('backups.create');
  const canEditBackupSettings = hasServerPermission('backups.settings.write');
  const canDeleteBackups = hasServerPermission('backups.delete');
  const canRestoreBackups = hasServerPermission('backups.restore');
  const canRenameBackups = hasServerPermission('backups.rename');
  const canReadScheduledTasks = hasServerPermission('scheduledtasks.read');
  const canWriteScheduledTasks = hasServerPermission('scheduledtasks.write');

  // Minecraft Java
  const canReadMinecraftSettings = hasServerPermission('minecraft.settings.read');
  const canWriteMinecraftSettings = hasServerPermission('minecraft.settings.write');
  const canReadMinecraftOperators = hasServerPermission('minecraft.operators.read');
  const canWriteMinecraftOperators = hasServerPermission('minecraft.operators.write');
  const canReadMinecraftWhitelist = hasServerPermission('minecraft.whitelist.read');
  const canWriteMinecraftWhitelist = hasServerPermission('minecraft.whitelist.write');
  const canReadMinecraftBans = hasServerPermission('minecraft.bans.read');
  const canWriteMinecraftBans = hasServerPermission('minecraft.bans.write');
  const canReadMinecraftIpBans = hasServerPermission('minecraft.ip-bans.read');
  const canWriteMinecraftIpBans = hasServerPermission('minecraft.ip-bans.write');
  const canReadMinecraftAddons = hasServerPermission('minecraft.addons.read');
  const canWriteMinecraftAddons = hasServerPermission('minecraft.addons.write');
  const canUseMinecraft =
    canReadMinecraftSettings ||
    canReadMinecraftOperators ||
    canReadMinecraftWhitelist ||
    canReadMinecraftBans ||
    canReadMinecraftIpBans ||
    canReadMinecraftAddons;

  // Hytale
  const canReadHytaleSettings = hasServerPermission('hytale.settings.read');
  const canWriteHytaleSettings = hasServerPermission('hytale.settings.write');
  const canReadHytaleMods = hasServerPermission('hytale.mods.read');
  const canWriteHytaleMods = hasServerPermission('hytale.mods.write');
  const canUseHytale = canReadHytaleSettings || canWriteHytaleSettings || canReadHytaleMods || canWriteHytaleMods;

  // CS2
  const canWriteCS2Frameworks = hasServerPermission('cs2.frameworks.write');

  const hasAnySettingsAccess =
    canUseGameConfig || canUseFileManager || canUseTerminal || canUseBackup ||
    canEditContainerConfig || canReadScheduledTasks || canWriteScheduledTasks ||
    canUseMinecraft || canUseHytale;

  const canAccessTab = (tab: SettingsTab): boolean => {
    switch (tab) {
      case 'filemanager':   return canUseFileManager;
      case 'terminal':      return canUseTerminal;
      case 'gameconfig':    return canUseGameConfigTab;
      case 'backup':        return canUseBackup;
      case 'containerconfig': return canEditContainerConfig;
      // Reading scheduled tasks now requires `scheduledtasks.read`.
      case 'scheduledtasks':  return canReadScheduledTasks;
      default:              return false;
    }
  };

  return {
    canUseFileManager,
    canUseTerminal,
    canUseGameConfig,
    canUseGameConfigTab,
    canUseBackup,
    canReadBackups,
    canReadScheduledTasks,
    canEditContainerConfig,
    canManageEnv,
    hasAnySettingsAccess,
    canWriteFiles,
    canDownloadBackups,
    canCreateBackups,
    canEditBackupSettings,
    canDeleteBackups,
    canRestoreBackups,
    canRenameBackups,
    canWriteScheduledTasks,
    canReadMinecraftSettings,
    canWriteMinecraftSettings,
    canReadMinecraftOperators,
    canWriteMinecraftOperators,
    canReadMinecraftWhitelist,
    canWriteMinecraftWhitelist,
    canReadMinecraftBans,
    canWriteMinecraftBans,
    canReadMinecraftIpBans,
    canWriteMinecraftIpBans,
    canReadMinecraftAddons,
    canWriteMinecraftAddons,
    canUseMinecraft,
    canReadHytaleSettings,
    canWriteHytaleSettings,
    canReadHytaleMods,
    canWriteHytaleMods,
    canUseHytale,
    canWriteCS2Frameworks,
    canAccessTab,
  };
}
