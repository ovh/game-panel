import type { Dispatch, SetStateAction } from 'react';
import { apiClient } from '../../utils/api';
import { isServerBusyForFileMutations } from './utils';

export interface BackupItem {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
}

interface CreateCopyPathHandlerDeps {
  currentPath: string;
  setCopyPathSuccess: Dispatch<SetStateAction<boolean>>;
}

export const createCopyPathHandler =
  ({ currentPath, setCopyPathSuccess }: CreateCopyPathHandlerDeps) =>
  () => {
    navigator.clipboard.writeText(currentPath);
    setCopyPathSuccess(true);
    setTimeout(() => setCopyPathSuccess(false), 2000);
  };

interface CreateCopyContentHandlerDeps {
  fileContent: string;
  setCopyContentSuccess: Dispatch<SetStateAction<boolean>>;
}

export const createCopyContentHandler =
  ({ fileContent, setCopyContentSuccess }: CreateCopyContentHandlerDeps) =>
  () => {
    navigator.clipboard.writeText(fileContent);
    setCopyContentSuccess(true);
    setTimeout(() => setCopyContentSuccess(false), 2000);
  };

interface CreateDownloadBackupHandlerDeps {
  canDownloadBackups: boolean;
  serverId?: number | null;
  setBackupDownloadLoading: Dispatch<SetStateAction<string | null>>;
  setBackupsError: Dispatch<SetStateAction<string | null>>;
}

export const createDownloadBackupHandler =
  ({
    canDownloadBackups,
    serverId,
    setBackupDownloadLoading,
    setBackupsError,
  }: CreateDownloadBackupHandlerDeps) =>
  async (backup: BackupItem) => {
    if (!canDownloadBackups) return;
    if (!serverId) return;
    setBackupDownloadLoading(backup.name);
    setBackupsError(null);
    try {
      const { blob, filename } = await apiClient.downloadBackupFile(serverId, backup.path);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || backup.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setBackupsError(error?.response?.data?.error || 'Failed to download backup');
    } finally {
      setBackupDownloadLoading(null);
    }
  };

interface CreateDeleteBackupHandlerDeps {
  canDeleteBackups: boolean;
  serverId?: number | null;
  setBackupDeleteLoading: Dispatch<SetStateAction<string | null>>;
  setBackupsError: Dispatch<SetStateAction<string | null>>;
  loadBackups: () => Promise<void>;
  requestConfirm: (title: string, message: string, onConfirm: () => Promise<void>) => void;
}

export const createDeleteBackupHandler =
  ({
    canDeleteBackups,
    serverId,
    setBackupDeleteLoading,
    setBackupsError,
    loadBackups,
    requestConfirm,
  }: CreateDeleteBackupHandlerDeps) =>
  (backup: BackupItem) => {
    if (!canDeleteBackups) return;
    if (!serverId) return;
    requestConfirm(
      'Delete Backup',
      `Delete backup "${backup.name}"? This action cannot be undone.`,
      async () => {
        setBackupDeleteLoading(backup.name);
        setBackupsError(null);
        try {
          await apiClient.deleteBackupFile(serverId, backup.path);
          await loadBackups();
        } catch (error: any) {
          setBackupsError(error?.response?.data?.error || 'Failed to delete backup');
        } finally {
          setBackupDeleteLoading(null);
        }
      }
    );
  };

interface CreateExecuteBackupNowHandlerDeps {
  canCreateBackups: boolean;
  serverId?: number | null;
  setBackupNowLoading: Dispatch<SetStateAction<boolean>>;
  setBackupsError: Dispatch<SetStateAction<string | null>>;
  loadBackups: () => Promise<void>;
}

export const createExecuteBackupNowHandler =
  ({
    canCreateBackups,
    serverId,
    setBackupNowLoading,
    setBackupsError,
    loadBackups,
  }: CreateExecuteBackupNowHandlerDeps) =>
  async () => {
    if (!canCreateBackups) return;
    if (!serverId) return;
    setBackupNowLoading(true);
    setBackupsError(null);
    try {
      const result = await apiClient.createBackup(serverId);
      if (!result?.ok) {
        throw new Error(
          result?.stderr || result?.stdout || `Backup failed (exitCode=${result?.exitCode ?? 'unknown'})`
        );
      }
      await loadBackups();
    } catch (error: any) {
      setBackupsError(error?.response?.data?.error || error?.message || 'Failed to start backup');
    } finally {
      setBackupNowLoading(false);
    }
  };

interface CreateBackupNowHandlerDeps {
  canCreateBackups: boolean;
  serverId?: number | null;
  setShowBackupNowWarningModal: Dispatch<SetStateAction<boolean>>;
  executeBackupNow: () => Promise<void>;
  hotBackupOnly?: boolean;
  skipWarning?: boolean;
}

export const createBackupNowHandler =
  ({
    canCreateBackups,
    serverId,
    setShowBackupNowWarningModal,
    executeBackupNow,
    hotBackupOnly = false,
    skipWarning = false,
  }: CreateBackupNowHandlerDeps) =>
  async () => {
    if (!canCreateBackups) return;
    if (!serverId) return;

    if (skipWarning) {
      await executeBackupNow();
      return;
    }

    if (hotBackupOnly) {
      setShowBackupNowWarningModal(true);
      return;
    }

    try {
      const server = await apiClient.getServer(serverId);
      if (isServerBusyForFileMutations(server?.status)) {
        setShowBackupNowWarningModal(true);
        return;
      }
    } catch {
      // If status lookup fails, continue with backup to avoid blocking action.
    }

    await executeBackupNow();
  };

interface CreateSaveBackupSettingsHandlerDeps {
  canEditBackupSettings: boolean;
  serverId?: number | null;
  backupRetention: number;
  backupRetentionDays: number;
  stopOnBackup: boolean;
  setBackupSaving: Dispatch<SetStateAction<boolean>>;
  setBackupSettingsError: Dispatch<SetStateAction<string | null>>;
  loadBackupSettings: () => Promise<void>;
}

export const createSaveBackupSettingsHandler =
  ({
    canEditBackupSettings,
    serverId,
    backupRetention,
    backupRetentionDays,
    stopOnBackup,
    setBackupSaving,
    setBackupSettingsError,
    loadBackupSettings,
  }: CreateSaveBackupSettingsHandlerDeps) =>
  async () => {
    if (!canEditBackupSettings) return;
    if (!serverId) return;
    setBackupSaving(true);
    setBackupSettingsError(null);
    try {
      const maxBackups = Math.max(0, Math.round(backupRetention));
      const maxBackupDays = Math.max(0, Math.round(backupRetentionDays));
      await apiClient.updateBackupSettings(serverId, {
        maxBackups,
        maxBackupDays,
        stopOnBackup,
      });
      await loadBackupSettings();
    } catch (error: any) {
      setBackupSettingsError(error?.response?.data?.error || 'Failed to save retention settings');
    } finally {
      setBackupSaving(false);
    }
  };

interface CreateRenameBackupHandlerDeps {
  canRenameBackups: boolean;
  serverId?: number | null;
  setBackupRenameLoading: Dispatch<SetStateAction<string | null>>;
  setBackupsError: Dispatch<SetStateAction<string | null>>;
  loadBackups: () => Promise<void>;
}

export const createRenameBackupHandler =
  ({
    canRenameBackups,
    serverId,
    setBackupRenameLoading,
    setBackupsError,
    loadBackups,
  }: CreateRenameBackupHandlerDeps) =>
  async (backup: BackupItem, newName: string) => {
    if (!canRenameBackups) return;
    if (!serverId) return;
    setBackupRenameLoading(backup.name);
    setBackupsError(null);
    try {
      await apiClient.renameBackupFile(serverId, backup.path, newName);
      await loadBackups();
    } catch (error: any) {
      setBackupsError(error?.response?.data?.error || 'Failed to rename backup');
    } finally {
      setBackupRenameLoading(null);
    }
  };

interface CreateRestoreBackupHandlerDeps {
  canRestoreBackups: boolean;
  serverId?: number | null;
  setBackupRestoreLoading: Dispatch<SetStateAction<string | null>>;
  setBackupsError: Dispatch<SetStateAction<string | null>>;
  requestConfirm: (title: string, message: string, onConfirm: () => Promise<void>) => void;
}

export const createRestoreBackupHandler =
  ({
    canRestoreBackups,
    serverId,
    setBackupRestoreLoading,
    setBackupsError,
    requestConfirm,
  }: CreateRestoreBackupHandlerDeps) =>
  (backup: BackupItem) => {
    if (!canRestoreBackups) return;
    if (!serverId) return;
    requestConfirm(
      'Restore Backup',
      `Restore "${backup.name}"? This will overwrite the current server data.`,
      async () => {
        setBackupRestoreLoading(backup.name);
        setBackupsError(null);
        try {
          const result = await apiClient.restoreBackup(serverId, backup.path);
          if (!result?.ok) {
            throw new Error(result?.stderr || result?.stdout || `Restore failed (exitCode=${result?.exitCode ?? 'unknown'})`);
          }
        } catch (error: any) {
          setBackupsError(error?.response?.data?.error || error?.message || 'Failed to restore backup');
        } finally {
          setBackupRestoreLoading(null);
        }
      }
    );
  };

