import type { Dispatch, SetStateAction } from 'react';
import { apiClient } from '../../utils/api';
import { buildCronSchedule, isServerBusyForFileMutations } from './utils';

export interface BackupItem {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
}

const validatePassword = (password: string, confirm: string): string | null => {
  if (password !== confirm) {
    return 'Passwords do not match';
  }

  if (password.length < 10) {
    return 'Password must be at least 10 characters';
  }

  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (!hasUppercase || !hasNumber || !hasSpecial) {
    return 'Password must contain uppercase, number, and special character';
  }

  return null;
};

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

interface CreateCopySftpDetailHandlerDeps {
  setCopiedSftp: Dispatch<SetStateAction<string | null>>;
}

export const createCopySftpDetailHandler =
  ({ setCopiedSftp }: CreateCopySftpDetailHandlerDeps) =>
  (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSftp(type);
    setTimeout(() => setCopiedSftp(null), 2000);
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
  backupsPath: string;
  setBackupDeleteLoading: Dispatch<SetStateAction<string | null>>;
  setBackupsError: Dispatch<SetStateAction<string | null>>;
  loadBackups: (path?: string) => Promise<void>;
}

export const createDeleteBackupHandler =
  ({
    canDeleteBackups,
    serverId,
    backupsPath,
    setBackupDeleteLoading,
    setBackupsError,
    loadBackups,
  }: CreateDeleteBackupHandlerDeps) =>
  async (backup: BackupItem) => {
    if (!canDeleteBackups) return;
    if (!serverId) return;
    if (!confirm(`Delete backup "${backup.name}"?`)) return;
    setBackupDeleteLoading(backup.name);
    setBackupsError(null);
    try {
      await apiClient.deleteBackupFile(serverId, backup.path);
      await loadBackups(backupsPath);
    } catch (error: any) {
      setBackupsError(error?.response?.data?.error || 'Failed to delete backup');
    } finally {
      setBackupDeleteLoading(null);
    }
  };

interface CreateExecuteBackupNowHandlerDeps {
  canCreateBackups: boolean;
  serverId?: number | null;
  backupsPath: string;
  setBackupNowLoading: Dispatch<SetStateAction<boolean>>;
  setBackupsError: Dispatch<SetStateAction<string | null>>;
  loadBackups: (path?: string) => Promise<void>;
}

export const createExecuteBackupNowHandler =
  ({
    canCreateBackups,
    serverId,
    backupsPath,
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
      await loadBackups(backupsPath);
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
}

export const createBackupNowHandler =
  ({
    canCreateBackups,
    serverId,
    setShowBackupNowWarningModal,
    executeBackupNow,
  }: CreateBackupNowHandlerDeps) =>
  async () => {
    if (!canCreateBackups) return;
    if (!serverId) return;

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
  autoBackupEnabled: boolean;
  backupFrequencyType: 'hourly' | 'daily' | 'weekly';
  backupHours: number;
  backupTime: string;
  backupDay: string;
  setBackupSaving: Dispatch<SetStateAction<boolean>>;
  setBackupSettingsError: Dispatch<SetStateAction<string | null>>;
  setBackupCronError: Dispatch<SetStateAction<string | null>>;
  loadBackupSettings: () => Promise<void>;
  loadBackupCron: () => Promise<void>;
}

export const createSaveBackupSettingsHandler =
  ({
    canEditBackupSettings,
    serverId,
    backupRetention,
    backupRetentionDays,
    stopOnBackup,
    autoBackupEnabled,
    backupFrequencyType,
    backupHours,
    backupTime,
    backupDay,
    setBackupSaving,
    setBackupSettingsError,
    setBackupCronError,
    loadBackupSettings,
    loadBackupCron,
  }: CreateSaveBackupSettingsHandlerDeps) =>
  async () => {
    if (!canEditBackupSettings) return;
    if (!serverId) return;
    setBackupSaving(true);
    setBackupSettingsError(null);
    setBackupCronError(null);
    try {
      const maxbackups = Math.max(0, Math.round(backupRetention));
      const maxbackupdays = Math.max(0, Math.round(backupRetentionDays));
      await apiClient.updateBackupSettings(serverId, {
        maxbackups,
        maxbackupdays,
        stoponbackup: stopOnBackup,
      });

      if (autoBackupEnabled) {
        const schedule = buildCronSchedule({
          frequencyType: backupFrequencyType,
          hours: backupHours,
          time: backupTime,
          day: backupDay,
        });
        await apiClient.updateBackupCron(serverId, { enabled: true, schedule });
      } else {
        await apiClient.updateBackupCron(serverId, { enabled: false });
      }

      await Promise.all([loadBackupSettings(), loadBackupCron()]);
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to save backup settings';
      setBackupSettingsError(message);
    } finally {
      setBackupSaving(false);
    }
  };

interface CreateUpdateSftpPasswordHandlerDeps {
  serverId?: number | null;
  newPassword: string;
  confirmPassword: string;
  setSftpPasswordLoading: Dispatch<SetStateAction<boolean>>;
  setSftpError: Dispatch<SetStateAction<string | null>>;
  setNewPassword: Dispatch<SetStateAction<string>>;
  setConfirmPassword: Dispatch<SetStateAction<string>>;
}

export const createUpdateSftpPasswordHandler =
  ({
    serverId,
    newPassword,
    confirmPassword,
    setSftpPasswordLoading,
    setSftpError,
    setNewPassword,
    setConfirmPassword,
  }: CreateUpdateSftpPasswordHandlerDeps) =>
  async () => {
    if (!serverId) return;

    const validationError = validatePassword(newPassword, confirmPassword);
    if (validationError) {
      setSftpError(validationError);
      return;
    }

    setSftpPasswordLoading(true);
    setSftpError(null);
    try {
      await apiClient.setSftpPassword(serverId, newPassword);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setSftpError(error?.response?.data?.error || 'Failed to update SFTP password');
    } finally {
      setSftpPasswordLoading(false);
    }
  };

interface CreateEnableSftpHandlerDeps {
  serverId?: number | null;
  setShowFirstTimePasswordModal: Dispatch<SetStateAction<boolean>>;
  setSftpToggleLoading: Dispatch<SetStateAction<boolean>>;
  setSftpError: Dispatch<SetStateAction<string | null>>;
}

export const createEnableSftpHandler =
  ({
    serverId,
    setShowFirstTimePasswordModal,
    setSftpToggleLoading,
    setSftpError,
  }: CreateEnableSftpHandlerDeps) =>
  async () => {
    if (!serverId) return;

    setSftpToggleLoading(true);
    setSftpError(null);
    try {
      await apiClient.enableSftp(serverId);
    } catch (error: any) {
      const errorCode = error?.response?.data?.code;
      const errorMessage = error?.response?.data?.error;

      if (
        error?.response?.status === 400 &&
        (errorCode === 'SFTP_PASSWORD_NOT_SET' ||
          errorMessage === 'SFTP password not set. Please set a password before enabling.')
      ) {
        setShowFirstTimePasswordModal(true);
        return;
      }

      setSftpError(errorMessage || 'Failed to enable SFTP');
    } finally {
      setSftpToggleLoading(false);
    }
  };

interface CreateFirstTimePasswordSubmitHandlerDeps {
  serverId?: number | null;
  firstTimePassword: string;
  firstTimeConfirmPassword: string;
  setSftpPasswordLoading: Dispatch<SetStateAction<boolean>>;
  setFirstTimePasswordError: Dispatch<SetStateAction<string | null>>;
  setShowFirstTimePasswordModal: Dispatch<SetStateAction<boolean>>;
  setFirstTimePassword: Dispatch<SetStateAction<string>>;
  setFirstTimeConfirmPassword: Dispatch<SetStateAction<string>>;
  setShowFirstTimePassword: Dispatch<SetStateAction<boolean>>;
  setShowFirstTimeConfirmPassword: Dispatch<SetStateAction<boolean>>;
}

export const createFirstTimePasswordSubmitHandler =
  ({
    serverId,
    firstTimePassword,
    firstTimeConfirmPassword,
    setSftpPasswordLoading,
    setFirstTimePasswordError,
    setShowFirstTimePasswordModal,
    setFirstTimePassword,
    setFirstTimeConfirmPassword,
    setShowFirstTimePassword,
    setShowFirstTimeConfirmPassword,
  }: CreateFirstTimePasswordSubmitHandlerDeps) =>
  async () => {
    if (!serverId) return;

    const validationError = validatePassword(firstTimePassword, firstTimeConfirmPassword);
    if (validationError) {
      setFirstTimePasswordError(validationError);
      return;
    }

    setSftpPasswordLoading(true);
    setFirstTimePasswordError(null);
    try {
      await apiClient.setSftpPassword(serverId, firstTimePassword);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await apiClient.enableSftp(serverId);

      setShowFirstTimePasswordModal(false);
      setFirstTimePassword('');
      setFirstTimeConfirmPassword('');
      setShowFirstTimePassword(false);
      setShowFirstTimeConfirmPassword(false);
    } catch (error: any) {
      setFirstTimePasswordError(error?.response?.data?.error || 'Failed to set password and enable SFTP');
    } finally {
      setSftpPasswordLoading(false);
    }
  };

interface CreateCloseFirstTimePasswordModalHandlerDeps {
  setShowFirstTimePasswordModal: Dispatch<SetStateAction<boolean>>;
  setFirstTimePassword: Dispatch<SetStateAction<string>>;
  setFirstTimeConfirmPassword: Dispatch<SetStateAction<string>>;
  setFirstTimePasswordError: Dispatch<SetStateAction<string | null>>;
  setShowFirstTimePassword: Dispatch<SetStateAction<boolean>>;
  setShowFirstTimeConfirmPassword: Dispatch<SetStateAction<boolean>>;
}

export const createCloseFirstTimePasswordModalHandler =
  ({
    setShowFirstTimePasswordModal,
    setFirstTimePassword,
    setFirstTimeConfirmPassword,
    setFirstTimePasswordError,
    setShowFirstTimePassword,
    setShowFirstTimeConfirmPassword,
  }: CreateCloseFirstTimePasswordModalHandlerDeps) =>
  () => {
    setShowFirstTimePasswordModal(false);
    setFirstTimePassword('');
    setFirstTimeConfirmPassword('');
    setFirstTimePasswordError(null);
    setShowFirstTimePassword(false);
    setShowFirstTimeConfirmPassword(false);
  };

interface CreateDisableSftpHandlerDeps {
  serverId?: number | null;
  setSftpToggleLoading: Dispatch<SetStateAction<boolean>>;
  setSftpError: Dispatch<SetStateAction<string | null>>;
}

export const createDisableSftpHandler =
  ({ serverId, setSftpToggleLoading, setSftpError }: CreateDisableSftpHandlerDeps) =>
  async () => {
    if (!serverId) return;
    setSftpToggleLoading(true);
    setSftpError(null);
    try {
      await apiClient.disableSftp(serverId);
    } catch (error: any) {
      setSftpError(error?.response?.data?.error || 'Failed to disable SFTP');
    } finally {
      setSftpToggleLoading(false);
    }
  };

interface CreateUpdateSftpPasswordModalHandlerDeps {
  serverId?: number | null;
  sftpModalPassword: string;
  sftpModalConfirmPassword: string;
  setSftpPasswordLoading: Dispatch<SetStateAction<boolean>>;
  setSftpModalPasswordError: Dispatch<SetStateAction<string | null>>;
  setShowSftpPasswordModal: Dispatch<SetStateAction<boolean>>;
  setSftpModalPassword: Dispatch<SetStateAction<string>>;
  setSftpModalConfirmPassword: Dispatch<SetStateAction<string>>;
  setShowSftpModalPassword: Dispatch<SetStateAction<boolean>>;
  setShowSftpModalConfirmPassword: Dispatch<SetStateAction<boolean>>;
}

export const createUpdateSftpPasswordModalHandler =
  ({
    serverId,
    sftpModalPassword,
    sftpModalConfirmPassword,
    setSftpPasswordLoading,
    setSftpModalPasswordError,
    setShowSftpPasswordModal,
    setSftpModalPassword,
    setSftpModalConfirmPassword,
    setShowSftpModalPassword,
    setShowSftpModalConfirmPassword,
  }: CreateUpdateSftpPasswordModalHandlerDeps) =>
  async () => {
    if (!serverId) return;

    const validationError = validatePassword(sftpModalPassword, sftpModalConfirmPassword);
    if (validationError) {
      setSftpModalPasswordError(validationError);
      return;
    }

    setSftpPasswordLoading(true);
    setSftpModalPasswordError(null);
    try {
      await apiClient.setSftpPassword(serverId, sftpModalPassword);
      await new Promise((resolve) => setTimeout(resolve, 500));
      setShowSftpPasswordModal(false);
      setSftpModalPassword('');
      setSftpModalConfirmPassword('');
      setShowSftpModalPassword(false);
      setShowSftpModalConfirmPassword(false);
    } catch (error: any) {
      setSftpModalPasswordError(error?.response?.data?.error || 'Failed to update password');
    } finally {
      setSftpPasswordLoading(false);
    }
  };

interface CreateCloseSftpPasswordModalHandlerDeps {
  setShowSftpPasswordModal: Dispatch<SetStateAction<boolean>>;
  setSftpModalPassword: Dispatch<SetStateAction<string>>;
  setSftpModalConfirmPassword: Dispatch<SetStateAction<string>>;
  setSftpModalPasswordError: Dispatch<SetStateAction<string | null>>;
  setShowSftpModalPassword: Dispatch<SetStateAction<boolean>>;
  setShowSftpModalConfirmPassword: Dispatch<SetStateAction<boolean>>;
}

export const createCloseSftpPasswordModalHandler =
  ({
    setShowSftpPasswordModal,
    setSftpModalPassword,
    setSftpModalConfirmPassword,
    setSftpModalPasswordError,
    setShowSftpModalPassword,
    setShowSftpModalConfirmPassword,
  }: CreateCloseSftpPasswordModalHandlerDeps) =>
  () => {
    setShowSftpPasswordModal(false);
    setSftpModalPassword('');
    setSftpModalConfirmPassword('');
    setSftpModalPasswordError(null);
    setShowSftpModalPassword(false);
    setShowSftpModalConfirmPassword(false);
  };
