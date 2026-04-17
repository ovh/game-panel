import { useEffect, useState } from 'react';
import { apiClient } from '../../utils/api';
import { joinPath, parseCronSchedule } from './utils';
import type { BackupItem } from './actionHandlers';

interface UseBackupStateArgs {
  serverId?: number | null;
  isActive: boolean;
}

export function useBackupState({ serverId, isActive }: UseBackupStateArgs) {
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [backupFrequencyType, setBackupFrequencyType] = useState<'hourly' | 'daily' | 'weekly'>(
    'daily'
  );
  const [backupHours, setBackupHours] = useState(6);
  const [backupTime, setBackupTime] = useState('02:00');
  const [backupDay, setBackupDay] = useState('sunday');
  const [backupRetention, setBackupRetention] = useState(7);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [backupsPath, setBackupsPath] = useState('/');
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [backupSettingsLoading, setBackupSettingsLoading] = useState(false);
  const [backupSettingsError, setBackupSettingsError] = useState<string | null>(null);
  const [backupCronError, setBackupCronError] = useState<string | null>(null);
  const [stopOnBackup, setStopOnBackup] = useState(false);
  const [backupRetentionDays, setBackupRetentionDays] = useState(0);
  const [backupNowLoading, setBackupNowLoading] = useState(false);
  const [showBackupNowWarningModal, setShowBackupNowWarningModal] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupDownloadLoading, setBackupDownloadLoading] = useState<string | null>(null);
  const [backupDeleteLoading, setBackupDeleteLoading] = useState<string | null>(null);

  const loadBackups = async (path: string = '/') => {
    if (!serverId) return;
    setBackupsLoading(true);
    setBackupsError(null);
    try {
      const result = await apiClient.listBackups(serverId, path);
      const items: BackupItem[] = result.entries.map((entry) => ({
        name: entry.name,
        path: joinPath(result.path || '/', entry.name),
        size: entry.size,
        modifiedAt: entry.modifiedAt,
      }));
      setBackupsPath(result.path || '/');
      setBackups(items);
    } catch (error: any) {
      setBackupsError(error?.response?.data?.error || 'Failed to load backups');
    } finally {
      setBackupsLoading(false);
    }
  };

  const loadBackupSettings = async () => {
    if (!serverId) return;
    setBackupSettingsLoading(true);
    setBackupSettingsError(null);
    try {
      const settings = await apiClient.getBackupSettings(serverId);
      const maxBackups = Number.isFinite(settings.maxbackups)
        ? Math.max(0, settings.maxbackups)
        : 7;
      setBackupRetention(maxBackups);
      setStopOnBackup(Boolean(settings.stoponbackup));
      const maxDays = Number.isFinite(settings.maxbackupdays)
        ? Math.max(0, settings.maxbackupdays)
        : 0;
      setBackupRetentionDays(maxDays);
    } catch (error: any) {
      setBackupSettingsError(error?.response?.data?.error || 'Failed to load backup settings');
    } finally {
      setBackupSettingsLoading(false);
    }
  };

  const loadBackupCron = async () => {
    if (!serverId) return;
    setBackupCronError(null);
    try {
      const cron = await apiClient.getBackupCron(serverId);
      if (!cron.enabled) {
        setAutoBackupEnabled(false);
        return;
      }

      setAutoBackupEnabled(true);
      const parsed = parseCronSchedule(cron.schedule, {
        hours: 6,
        time: '02:00',
        day: 'sunday',
      });
      if (parsed) {
        setBackupFrequencyType(parsed.type);
        setBackupHours(parsed.hours);
        setBackupTime(parsed.time);
        setBackupDay(parsed.day);
      }
    } catch (error: any) {
      setBackupCronError(error?.response?.data?.error || 'Failed to load backup schedule');
    }
  };

  const loadBackupData = async () => {
    if (!serverId) return;
    await Promise.all([loadBackups('/'), loadBackupSettings(), loadBackupCron()]);
  };

  useEffect(() => {
    if (!isActive || !serverId) return;
    void loadBackupData();
  }, [isActive, serverId]);

  return {
    autoBackupEnabled,
    setAutoBackupEnabled,
    backupFrequencyType,
    setBackupFrequencyType,
    backupHours,
    setBackupHours,
    backupTime,
    setBackupTime,
    backupDay,
    setBackupDay,
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
    backupCronError,
    setBackupCronError,
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
    loadBackups,
    loadBackupSettings,
    loadBackupCron,
  };
}
