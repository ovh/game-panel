import type { AuthUser } from '../../utils/permissions';

export type SettingsTab = 'filemanager' | 'backup' | 'sftp' | 'gameconfig' | 'terminal';

export const SETTINGS_TAB_PRIORITY: SettingsTab[] = [
  'gameconfig',
  'filemanager',
  'backup',
  'sftp',
  'terminal',
];

export interface ServerSettingsAccess {
  canUseFileManager: boolean;
  canUseSftp: boolean;
  canUseTerminal: boolean;
  canUseGameConfig: boolean;
  canManageGameUpdates: boolean;
  canUseGameConfigTab: boolean;
  canUseBackup: boolean;
  hasAnySettingsAccess: boolean;
  canWriteFiles: boolean;
  canDownloadBackups: boolean;
  canCreateBackups: boolean;
  canEditBackupSettings: boolean;
  canDeleteBackups: boolean;
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
  const canUseSftp = hasServerPermission('sftp.manage');
  const canUseTerminal = hasServerPermission('ssh.terminal');
  const canUseGameConfig = canUseFileManager;
  const canManageGameUpdates = hasServerPermission('server.gamesettings.write');
  const canUseGameConfigTab = canUseGameConfig;
  const canUseBackup =
    hasServerPermission('backups.download') ||
    hasServerPermission('backups.create') ||
    hasServerPermission('backups.settings.write') ||
    hasServerPermission('backups.delete');
  const hasAnySettingsAccess =
    canUseGameConfig || canUseFileManager || canUseSftp || canUseTerminal || canUseBackup;
  const canWriteFiles = hasServerPermission('fs.write');
  const canDownloadBackups = hasServerPermission('backups.download');
  const canCreateBackups = hasServerPermission('backups.create');
  const canEditBackupSettings = hasServerPermission('backups.settings.write');
  const canDeleteBackups = hasServerPermission('backups.delete');

  const canAccessTab = (tab: SettingsTab): boolean => {
    switch (tab) {
      case 'filemanager':
        return canUseFileManager;
      case 'sftp':
        return canUseSftp;
      case 'terminal':
        return canUseTerminal;
      case 'gameconfig':
        return canUseGameConfigTab;
      case 'backup':
        return canUseBackup;
      default:
        return false;
    }
  };

  return {
    canUseFileManager,
    canUseSftp,
    canUseTerminal,
    canUseGameConfig,
    canManageGameUpdates,
    canUseGameConfigTab,
    canUseBackup,
    hasAnySettingsAccess,
    canWriteFiles,
    canDownloadBackups,
    canCreateBackups,
    canEditBackupSettings,
    canDeleteBackups,
    canAccessTab,
  };
}
