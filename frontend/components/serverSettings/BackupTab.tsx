import { AppButton, AppInput, AppSelect, AppToggle } from '../../src/ui/components';
import {
  AlertTriangle,
  Calendar,
  Clock,
  Download,
  HardDrive,
  RefreshCw,
  Save,
  Shield,
  Trash2,
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
  backupCronError: string | null;
  autoBackupEnabled: boolean;
  setAutoBackupEnabled: (value: boolean) => void;
  backupFrequencyType: 'hourly' | 'daily' | 'weekly';
  setBackupFrequencyType: (value: 'hourly' | 'daily' | 'weekly') => void;
  backupHours: number;
  setBackupHours: (value: number) => void;
  backupTime: string;
  setBackupTime: (value: string) => void;
  backupDay: string;
  setBackupDay: (value: string) => void;
  handleSaveBackupSettings: () => void;
  canEditBackupSettings: boolean;
  backupSaving: boolean;
  backupSettingsLoading: boolean;
  loadBackups: (path: string) => void;
  backupsPath: string;
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
}

export function BackupTab({
  contentBg,
  borderColor,
  hoverBg,
  inputBg,
  inputBorder,
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
  backupCronError,
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
  handleSaveBackupSettings,
  canEditBackupSettings,
  backupSaving,
  backupSettingsLoading,
  loadBackups,
  backupsPath,
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
}: BackupTabProps) {
  const backupSliderClass = 'gp-game-config-range w-full';
  const backupToggleRowClass = `p-4 rounded-lg border ${borderColor} bg-gray-900/30 flex items-center justify-between gap-4`;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className={`text-2xl font-bold ${textPrimary} mb-2`}>Backups</h3>
            <p className={`text-sm ${textSecondary}`}>
              Manage automatic backups and download existing backups for {serverName}
            </p>
          </div>
          <AppButton
            onClick={handleBackupNow}
            disabled={!canCreateBackups || backupNowLoading}
            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors disabled:opacity-60 w-full sm:w-auto flex-shrink-0 ${
              canCreateBackups
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Download className="w-5 h-5" />
            <span>{backupNowLoading ? 'Creating backup...' : 'Create backup now'}</span>
          </AppButton>
        </div>

        <div
          className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-6 space-y-6 sm:space-y-8`}
        >
          <div>
            <h4 className={`text-lg font-semibold ${textPrimary} mb-1`}>Retention Policy</h4>
          </div>
          {backupSettingsError && <div className="text-sm text-red-400">{backupSettingsError}</div>}
          <div className="space-y-5">
            <div className={`p-4 rounded-lg border ${borderColor} bg-gray-900/30 space-y-3`}>
              <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-start">
                <label className={`block text-sm font-medium ${textPrimary}`}>
                  Keep the last backups
                </label>
                <span className={`text-sm font-semibold text-[var(--color-cyan-400)] text-right`}>
                  {backupRetention === 0 ? 'Unlimited' : `${backupRetention} backups`}
                </span>
                <p className={`text-xs ${textSecondary} col-span-2`}>Set 0 to keep all backups.</p>
                <div className="col-span-2">
                  <input
                    type="range"
                    min="0"
                    max="30"
                    value={backupRetention}
                    onChange={(event) => setBackupRetention(parseInt(event.target.value) || 0)}
                    className={backupSliderClass}
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
            <div className={`p-4 rounded-lg border ${borderColor} bg-gray-900/30 space-y-3`}>
              <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-start">
                <label className={`block text-sm font-medium ${textPrimary}`}>
                  Keep backups for days
                </label>
                <span className={`text-sm font-semibold text-[var(--color-cyan-400)] text-right`}>
                  {backupRetentionDays === 0 ? 'Unlimited' : `${backupRetentionDays} days`}
                </span>
                <p className={`text-xs ${textSecondary} col-span-2`}>
                  Set 0 to keep backups forever.
                </p>
                <div className="col-span-2">
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={backupRetentionDays}
                    onChange={(event) => setBackupRetentionDays(parseInt(event.target.value) || 0)}
                    className={backupSliderClass}
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
            <div
              className={backupToggleRowClass}
            >
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
        </div>

        <div
          className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6`}
        >
          <div>
            <h4 className={`text-lg font-semibold ${textPrimary} mb-1`}>Automatic Backups</h4>
            <p className={`text-sm ${textSecondary}`}>Configure automated backup scheduling</p>
          </div>

          {backupCronError && <div className="text-sm text-red-400">{backupCronError}</div>}

          <div className={backupToggleRowClass}>
            <div className="flex-1">
              <p className={`text-sm font-medium ${textPrimary}`}>Enable automatic backups</p>
              <p className={`text-xs ${textSecondary}`}>
                Run scheduled backups using the selected frequency.
              </p>
            </div>
            <AppToggle
              ariaLabel="Enable automatic backups"
              checked={autoBackupEnabled}
              size="standard"
              onChange={setAutoBackupEnabled}
              className="flex-shrink-0"
            />
          </div>

          {autoBackupEnabled && (
            <>
              <div className={`border-t ${borderColor} pt-4 sm:pt-6 space-y-4 sm:space-y-6`}>
                <div>
                  <label className={`block text-sm font-medium ${textPrimary} mb-3`}>
                    Backup Frequency
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <AppButton
                      onClick={() => setBackupFrequencyType('hourly')}
                      className={`flex flex-col items-center justify-center p-3 sm:p-4 rounded-lg border-2 transition-all ${
                        backupFrequencyType === 'hourly'
                          ? 'border-[var(--color-cyan-400)] bg-[#0050D7]/10'
                          : 'border-gray-300 bg-[#1f2937]'
                      }`}
                    >
                      <Clock
                        className={`w-6 h-6 mb-2 ${
                          backupFrequencyType === 'hourly' ? 'text-[var(--color-cyan-400)]' : textSecondary
                        }`}
                      />
                      <span
                        className={`text-sm font-medium ${
                          backupFrequencyType === 'hourly' ? 'text-[var(--color-cyan-400)]' : textSecondary
                        }`}
                      >
                        Hourly
                      </span>
                    </AppButton>
                    <AppButton
                      onClick={() => setBackupFrequencyType('daily')}
                      className={`flex flex-col items-center justify-center p-3 sm:p-4 rounded-lg border-2 transition-all ${
                        backupFrequencyType === 'daily'
                          ? 'border-[var(--color-cyan-400)] bg-[#0050D7]/10'
                          : 'border-gray-300 bg-[#1f2937]'
                      }`}
                    >
                      <Calendar
                        className={`w-6 h-6 mb-2 ${
                          backupFrequencyType === 'daily' ? 'text-[var(--color-cyan-400)]' : textSecondary
                        }`}
                      />
                      <span
                        className={`text-sm font-medium ${
                          backupFrequencyType === 'daily' ? 'text-[var(--color-cyan-400)]' : textSecondary
                        }`}
                      >
                        Daily
                      </span>
                    </AppButton>
                    <AppButton
                      onClick={() => setBackupFrequencyType('weekly')}
                      className={`flex flex-col items-center justify-center p-3 sm:p-4 rounded-lg border-2 transition-all ${
                        backupFrequencyType === 'weekly'
                          ? 'border-[var(--color-cyan-400)] bg-[#0050D7]/10'
                          : 'border-gray-300 bg-[#1f2937]'
                      }`}
                    >
                      <Calendar
                        className={`w-6 h-6 mb-2 ${
                          backupFrequencyType === 'weekly' ? 'text-[var(--color-cyan-400)]' : textSecondary
                        }`}
                      />
                      <span
                        className={`text-sm font-medium ${
                          backupFrequencyType === 'weekly' ? 'text-[var(--color-cyan-400)]' : textSecondary
                        }`}
                      >
                        Weekly
                      </span>
                    </AppButton>
                  </div>
                </div>

                {backupFrequencyType === 'hourly' && (
                  <div>
                    <label className={`block text-sm font-medium ${textPrimary} mb-2`}>
                      Every X hours
                    </label>
                    <AppInput
                      type="number"
                      min="1"
                      max="24"
                      value={backupHours}
                      onChange={(event) => setBackupHours(parseInt(event.target.value) || 1)}
                      className={`w-full px-4 py-2 ${inputBg} border ${inputBorder} rounded ${textPrimary} focus:outline-none focus:ring-2 focus:ring-[var(--color-cyan-400)] focus:border-transparent`}
                    />
                  </div>
                )}

                {backupFrequencyType === 'daily' && (
                  <div>
                    <label className={`block text-sm font-medium ${textPrimary} mb-2`}>Time</label>
                    <AppInput
                      type="time"
                      value={backupTime}
                      onChange={(event) => setBackupTime(event.target.value)}
                      className={`w-full px-4 py-2 ${inputBg} border ${inputBorder} rounded ${textPrimary} focus:outline-none focus:ring-2 focus:ring-[var(--color-cyan-400)] focus:border-transparent`}
                    />
                  </div>
                )}

                {backupFrequencyType === 'weekly' && (
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium ${textPrimary} mb-2`}>
                        Day of Week
                      </label>
                      <AppSelect
                        value={backupDay}
                        onChange={(nextValue) => setBackupDay(nextValue)}
                        options={[
                          { label: 'Monday', value: 'monday' },
                          { label: 'Tuesday', value: 'tuesday' },
                          { label: 'Wednesday', value: 'wednesday' },
                          { label: 'Thursday', value: 'thursday' },
                          { label: 'Friday', value: 'friday' },
                          { label: 'Saturday', value: 'saturday' },
                          { label: 'Sunday', value: 'sunday' },
                        ]}
                        className={`w-full px-4 py-2 ${inputBg} border ${inputBorder} rounded ${textPrimary} focus:outline-none focus:ring-2 focus:ring-[var(--color-cyan-400)] focus:border-transparent`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${textPrimary} mb-2`}>
                        Time
                      </label>
                      <AppInput
                        type="time"
                        value={backupTime}
                        onChange={(event) => setBackupTime(event.target.value)}
                        className={`w-full px-4 py-2 ${inputBg} border ${inputBorder} rounded ${textPrimary} focus:outline-none focus:ring-2 focus:ring-[var(--color-cyan-400)] focus:border-transparent`}
                      />
                    </div>
                  </div>
                )}

                <div
                  className={`flex items-start gap-3 p-3 sm:p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30`}
                >
                  <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <p className={`text-sm ${textSecondary}`}>
                    Increasing backup frequency may increase storage usage.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end">
          <AppButton
            onClick={handleSaveBackupSettings}
            disabled={!canEditBackupSettings || backupSaving || backupSettingsLoading}
            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-semibold transition-colors disabled:opacity-60 w-full sm:w-auto ${
              canEditBackupSettings
                ? 'bg-[#0050D7] hover:bg-[#157EEA] hover:text-white text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Save className="w-5 h-5" />
            <span>{backupSaving ? 'Saving...' : 'Save backup settings'}</span>
          </AppButton>
        </div>

        <div
          className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-6 space-y-3 sm:space-y-4`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
            <div>
              <h4 className={`text-lg font-semibold ${textPrimary} mb-1`}>Available Backups</h4>
              <p className={`text-sm ${textSecondary}`}>Download or delete your server backups</p>
            </div>
            <AppButton
              onClick={() => loadBackups(backupsPath)}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors bg-gray-700 hover:bg-gray-600 text-white w-full sm:w-auto"
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
            {!backupsLoading &&
              backups.map((backup) => (
                <div
                  key={backup.path}
                  className={`border ${borderColor} rounded-lg p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between transition-colors ${hoverBg}`}
                >
                  <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
                    <div className="p-2 md:p-3 bg-[#0050D7]/10 rounded flex-shrink-0">
                      <HardDrive className="w-5 h-5 md:w-6 md:h-6 text-[var(--color-cyan-400)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h5
                        className={`font-medium ${textPrimary} mb-1 text-sm md:text-base break-words`}
                      >
                        {backup.name}
                      </h5>
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
                      onClick={() => handleDownloadBackup(backup)}
                      disabled={!canDownloadBackups || backupDownloadLoading === backup.name}
                      className={`flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors whitespace-nowrap w-full sm:w-auto disabled:opacity-60 ${
                        canDownloadBackups
                          ? 'bg-[#0050D7] hover:bg-[#157EEA] hover:text-white text-white'
                          : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <Download className="w-4 h-4" />
                      {backupDownloadLoading === backup.name ? 'Downloading...' : 'Download'}
                    </AppButton>
                    <AppButton
                      onClick={() => handleDeleteBackup(backup)}
                      disabled={!canDeleteBackups || backupDeleteLoading === backup.name}
                      className={`flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors whitespace-nowrap w-full sm:w-auto disabled:opacity-60 ${
                        canDeleteBackups
                          ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                          : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                      {backupDeleteLoading === backup.name ? 'Deleting...' : 'Delete'}
                    </AppButton>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}



