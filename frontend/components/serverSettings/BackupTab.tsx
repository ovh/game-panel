import { useState } from 'react';
import { AppButton, AppSlider, AppToggle } from '../../src/ui/components';
import {
  AlertTriangle,
  Calendar,
  Check,
  Download,
  HardDrive,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';

interface BackupItem {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
}

interface BackupTabProps {
  contentBg: string;
  borderColor: string;
  hoverBg: string;
  inputBg: string;
  inputBorder: string;
  textPrimary: string;
  textSecondary: string;
  serverName: string;
  handleBackupNow: () => void;
  canCreateBackups: boolean;
  backupNowLoading: boolean;
  backupSettingsError: string | null;
  backupRetention: number;
  setBackupRetention: (value: number) => void;
  backupRetentionDays: number;
  setBackupRetentionDays: (value: number) => void;
  stopOnBackup: boolean;
  setStopOnBackup: (value: boolean) => void;
  handleSaveBackupSettings: () => void;
  canEditBackupSettings: boolean;
  backupSaving: boolean;
  backupSettingsLoading: boolean;
  loadBackups: () => void;
  backupsError: string | null;
  backupsLoading: boolean;
  backups: BackupItem[];
  formatBytes: (bytes: number) => string;
  handleDownloadBackup: (backup: BackupItem) => void;
  canDownloadBackups: boolean;
  backupDownloadLoading: string | null;
  handleDeleteBackup: (backup: BackupItem) => void;
  canDeleteBackups: boolean;
  backupDeleteLoading: string | null;
  handleRestoreBackup: (backup: BackupItem) => void;
  canRestoreBackups: boolean;
  backupRestoreLoading: string | null;
  handleRenameBackup: (backup: BackupItem, newName: string) => Promise<void>;
  canRenameBackups: boolean;
  backupRenameLoading: string | null;
  isLinuxGSMGame: boolean;
  backupsNotSupported: boolean;
  hideManualBackup?: boolean;
}

export function BackupTab({
  contentBg,
  borderColor,
  hoverBg,
  inputBg: _inputBg,
  inputBorder: _inputBorder,
  textPrimary,
  textSecondary,
  serverName,
  handleBackupNow,
  canCreateBackups,
  backupNowLoading,
  backupSettingsError,
  backupRetention,
  setBackupRetention,
  backupRetentionDays,
  setBackupRetentionDays,
  stopOnBackup,
  setStopOnBackup,
  handleSaveBackupSettings,
  canEditBackupSettings,
  backupSaving,
  backupSettingsLoading,
  loadBackups,
  backupsError,
  backupsLoading,
  backups,
  formatBytes,
  handleDownloadBackup,
  canDownloadBackups,
  backupDownloadLoading,
  handleDeleteBackup,
  canDeleteBackups,
  backupDeleteLoading,
  handleRestoreBackup,
  canRestoreBackups,
  backupRestoreLoading,
  handleRenameBackup,
  canRenameBackups,
  backupRenameLoading,
  isLinuxGSMGame,
  backupsNotSupported,
  hideManualBackup = false,
}: BackupTabProps) {
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const startRename = (backup: BackupItem) => {
    setRenamingPath(backup.path);
    setRenameValue(backup.name);
  };

  const cancelRename = () => setRenamingPath(null);

  const confirmRename = async (backup: BackupItem) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === backup.name) { setRenamingPath(null); return; }
    await handleRenameBackup(backup, trimmed);
    setRenamingPath(null);
  };

  const toggleRowClass = `p-4 rounded-lg border ${borderColor} bg-gray-50 dark:bg-gray-900/30 flex items-center justify-between gap-4`;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className={`text-2xl font-bold ${textPrimary} mb-2`}>Backups</h3>
            <p className={`text-sm ${textSecondary}`}>
              Manage and download backups for {serverName}
            </p>
          </div>
          {!backupsNotSupported && !hideManualBackup && (
            <AppButton
              tone="primary"
              onClick={handleBackupNow}
              disabled={!canCreateBackups || backupNowLoading}
              className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60 w-full sm:w-auto flex-shrink-0"
            >
              <Download className="w-5 h-5" />
              <span>{backupNowLoading ? 'Creating backup...' : 'Create backup now'}</span>
            </AppButton>
          )}
        </div>

        {/* Not supported banner */}
        {backupsNotSupported && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className={`text-sm font-medium ${textPrimary}`}>Backups not supported</p>
              <p className={`text-xs ${textSecondary} mt-1`}>
                This server type does not support backups.
              </p>
            </div>
          </div>
        )}

        {/* Retention Policy — LinuxGSM only */}
        {isLinuxGSMGame && (
          <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-6 space-y-6 sm:space-y-8`}>
            <h4 className={`text-lg font-semibold ${textPrimary}`}>Retention Policy</h4>
            {backupSettingsError && <div className="text-sm text-red-400">{backupSettingsError}</div>}
            <div className="space-y-5">
              <div className={`p-4 rounded-lg border ${borderColor} bg-gray-50 dark:bg-gray-900/30 space-y-3`}>
                <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-start">
                  <label className={`block text-sm font-medium ${textPrimary}`}>Keep the last backups</label>
                  <span className="text-sm font-semibold text-[var(--color-cyan-400)] text-right">
                    {backupRetention === 0 ? 'Unlimited' : `${backupRetention} backups`}
                  </span>
                  <p className={`text-xs ${textSecondary} col-span-2`}>Set 0 to keep all backups.</p>
                  <div className="col-span-2">
                    <AppSlider
                      min={0} max={30} value={backupRetention}
                      onChange={(e) => setBackupRetention(parseInt(e.target.value) || 0)}
                    />
                    <div className={`mt-2 grid grid-cols-3 items-center text-[11px] ${textSecondary}`}>
                      <span className="text-left">0</span>
                      <span className={`text-center text-xs font-semibold ${textPrimary}`}>
                        {backupRetention === 0 ? 'Unlimited' : backupRetention}
                      </span>
                      <span className="text-right">30</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-lg border ${borderColor} bg-gray-50 dark:bg-gray-900/30 space-y-3`}>
                <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-start">
                  <label className={`block text-sm font-medium ${textPrimary}`}>Keep backups for days</label>
                  <span className="text-sm font-semibold text-[var(--color-cyan-400)] text-right">
                    {backupRetentionDays === 0 ? 'Unlimited' : `${backupRetentionDays} days`}
                  </span>
                  <p className={`text-xs ${textSecondary} col-span-2`}>Set 0 to keep backups forever.</p>
                  <div className="col-span-2">
                    <AppSlider
                      min={0} max={90} value={backupRetentionDays}
                      onChange={(e) => setBackupRetentionDays(parseInt(e.target.value) || 0)}
                    />
                    <div className={`mt-2 grid grid-cols-3 items-center text-[11px] ${textSecondary}`}>
                      <span className="text-left">0</span>
                      <span className={`text-center text-xs font-semibold ${textPrimary}`}>
                        {backupRetentionDays === 0 ? 'Unlimited' : backupRetentionDays}
                      </span>
                      <span className="text-right">90</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={toggleRowClass}>
                <div>
                  <p className={`text-sm font-medium ${textPrimary}`}>Stop server before backup</p>
                  <p className={`text-xs ${textSecondary}`}>Recommended for consistent saves.</p>
                </div>
                <AppToggle
                  ariaLabel="Stop server before backup"
                  checked={stopOnBackup}
                  size="standard"
                  onChange={setStopOnBackup}
                  className="flex-shrink-0"
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <AppButton
                tone="primary"
                onClick={handleSaveBackupSettings}
                disabled={!canEditBackupSettings || backupSaving || backupSettingsLoading}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium w-full sm:w-auto flex-shrink-0 disabled:opacity-60"
              >
                <Save className="w-5 h-5" />
                <span>{backupSaving ? 'Saving...' : 'Save retention settings'}</span>
              </AppButton>
            </div>
          </div>
        )}

        {/* Available Backups */}
        {!backupsNotSupported && (
          <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-6 space-y-3 sm:space-y-4`}>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
              <div>
                <h4 className={`text-lg font-semibold ${textPrimary} mb-1`}>Available Backups</h4>
                <p className={`text-sm ${textSecondary}`}>{isLinuxGSMGame ? 'Download or delete your server backups' : 'Download, restore or delete your server backups'}</p>
              </div>
              <AppButton
                onClick={() => loadBackups()}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white w-full sm:w-auto"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </AppButton>
            </div>

            {backupsError && <div className="text-sm text-red-400">{backupsError}</div>}

            <div className="space-y-3">
              {backupsLoading && <div className={`text-sm ${textSecondary}`}>Loading backups...</div>}
              {!backupsLoading && backups.length === 0 && (
                <div className={`text-sm ${textSecondary}`}>No backups found.</div>
              )}
              {!backupsLoading && backups.map((backup) => (
                <div
                  key={backup.path}
                  className={`border ${borderColor} rounded-lg p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between transition-colors ${hoverBg}`}
                >
                  <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
                    <div className="p-2 md:p-3 bg-[#0050D7]/10 rounded flex-shrink-0">
                      <HardDrive className="w-5 h-5 md:w-6 md:h-6 text-[var(--color-cyan-400)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {renamingPath === backup.path ? (
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            disabled={backupRenameLoading === backup.name}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void confirmRename(backup);
                              if (e.key === 'Escape') cancelRename();
                            }}
                            className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[var(--color-cyan-400)]"
                          />
                          <button
                            onClick={() => void confirmRename(backup)}
                            disabled={backupRenameLoading === backup.name || !renameValue.trim()}
                            className="p-1 rounded text-green-500 hover:bg-green-500/10 disabled:opacity-40"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelRename}
                            disabled={backupRenameLoading === backup.name}
                            className="p-1 rounded text-gray-400 hover:bg-gray-500/10 disabled:opacity-40"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mb-1">
                          <h5 className={`font-medium ${textPrimary} text-sm md:text-base break-words`}>
                            {backup.name}
                          </h5>
                          {canRenameBackups && (
                            <button
                              onClick={() => startRename(backup)}
                              className="p-1 rounded text-gray-400 hover:text-[var(--color-cyan-400)] hover:bg-[var(--color-cyan-400)]/10 flex-shrink-0"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-3 md:gap-4 text-xs text-gray-500 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span className="whitespace-nowrap">
                            {new Date(backup.modifiedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <HardDrive className="w-3 h-3" />
                          {formatBytes(backup.size)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    <AppButton
                      tone="primary"
                      onClick={() => handleDownloadBackup(backup)}
                      disabled={!canDownloadBackups || backupDownloadLoading === backup.name}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 whitespace-nowrap w-full sm:w-auto"
                    >
                      <Download className="w-4 h-4" />
                      {backupDownloadLoading === backup.name ? 'Downloading...' : 'Download'}
                    </AppButton>
                    {canRestoreBackups && !isLinuxGSMGame && (
                      <AppButton
                        tone="ghost"
                        onClick={() => handleRestoreBackup(backup)}
                        disabled={backupRestoreLoading !== null}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 whitespace-nowrap w-full sm:w-auto border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {backupRestoreLoading === backup.name ? 'Restoring...' : 'Restore'}
                      </AppButton>
                    )}
                    <AppButton
                      tone="critical"
                      onClick={() => handleDeleteBackup(backup)}
                      disabled={!canDeleteBackups || backupDeleteLoading === backup.name}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 whitespace-nowrap w-full sm:w-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                      {backupDeleteLoading === backup.name ? 'Deleting...' : 'Delete'}
                    </AppButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
