import { useEffect, useState } from 'react';
import { apiClient } from '../../utils/api';
import { joinPath } from './utils';
import type { BackupItem } from './actionHandlers';

interface UseBackupStateArgs {
  serverId?: number | null;
  isActive: boolean;
  isLinuxGSMGame: boolean;
}

export function useBackupState({ serverId, isActive, isLinuxGSMGame }: UseBackupStateArgs) {
  const [backupRetention, setBackupRetention] = useState(7);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [backupsPath, setBackupsPath] = useState('/');
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [backupSettingsLoading, setBackupSettingsLoading] = useState(false);
  const [backupSettingsError, setBackupSettingsError] = useState<string | null>(null);
  const [stopOnBackup, setStopOnBackup] = useState(false);
  const [backupRetentionDays, setBackupRetentionDays] = useState(0);
  const [backupNowLoading, setBackupNowLoading] = useState(false);
  const [showBackupNowWarningModal, setShowBackupNowWarningModal] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupDownloadLoading, setBackupDownloadLoading] = useState<string | null>(null);
  const [backupDeleteLoading, setBackupDeleteLoading] = useState<string | null>(null);
  const [backupRestoreLoading, setBackupRestoreLoading] = useState<string | null>(null);
  const [backupRenameLoading, setBackupRenameLoading] = useState<string | null>(null);
  const [backupsNotSupported, setBackupsNotSupported] = useState(false);

  const loadBackups = async () => {
    if (!serverId) return;
    setBackupsLoading(true);
    setBackupsError(null);
    setBackupsNotSupported(false);
    try {
      const result = await apiClient.listBackups(serverId);
      const items: BackupItem[] = result.entries
        .map((entry) => ({
          name: entry.name,
          path: joinPath(result.path || '/', entry.name),
          size: entry.size,
          modifiedAt: entry.modifiedAt,
        }))
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
      setBackupsPath(result.path || '/');
      setBackups(items);
    } catch (error: any) {
      if (error?.response?.status === 501) {
        setBackupsNotSupported(true);
      } else {
        setBackupsError(error?.response?.data?.error || 'Failed to load backups');
      }
    } finally {
      setBackupsLoading(false);
    }
  };

  const loadBackupSettings = async () => {
    if (!serverId || !isLinuxGSMGame) return;
    setBackupSettingsLoading(true);
    setBackupSettingsError(null);
    try {
      const settings = await apiClient.getBackupSettings(serverId);
      const maxBackups = Number.isFinite(settings.maxBackups)
        ? Math.max(0, settings.maxBackups)
        : 7;
      setBackupRetention(maxBackups);
      setStopOnBackup(Boolean(settings.stopOnBackup));
      const maxDays = Number.isFinite(settings.maxBackupDays)
        ? Math.max(0, settings.maxBackupDays)
        : 0;
      setBackupRetentionDays(maxDays);
    } catch (error: any) {
      setBackupSettingsError(error?.response?.data?.error || 'Failed to load backup settings');
    } finally {
      setBackupSettingsLoading(false);
    }
  };

  const loadBackupData = async () => {
    if (!serverId) return;
    await Promise.all([loadBackups(), loadBackupSettings()]);
  };

  useEffect(() => {
    if (!isActive || !serverId) return;
    void loadBackupData();
  }, [isActive, serverId]);

  return {
    backupRetention,
    setBackupRetention,
    backups,
    backupsPath,
    backupsLoading,
    backupsError,
    setBackupsError,
    backupSettingsLoading,
    backupSettingsError,
    setBackupSettingsError,
    stopOnBackup,
    setStopOnBackup,
    backupRetentionDays,
    setBackupRetentionDays,
    backupNowLoading,
    setBackupNowLoading,
    showBackupNowWarningModal,
    setShowBackupNowWarningModal,
    backupSaving,
    setBackupSaving,
    backupDownloadLoading,
    setBackupDownloadLoading,
    backupDeleteLoading,
    setBackupDeleteLoading,
    backupRestoreLoading,
    setBackupRestoreLoading,
    backupRenameLoading,
    setBackupRenameLoading,
    backupsNotSupported,
    loadBackups,
    loadBackupSettings,
  };
}
