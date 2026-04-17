import { useMemo } from 'react';
import { CheckCircle, XCircle, Loader2, Terminal } from 'lucide-react';

interface InstallationProgressModalProps {
  isOpen: boolean;
  gameName: string;
  installing?: boolean;
  installError?: string | null;
  progressPercent?: number;
  status?: string | null;
  serverId?: number;
  permissionsSyncing?: boolean;
  canOpenConsole?: boolean;
  onClose: () => void;
  onOpenConsole?: (serverId: number) => void;
  onRetryInstall?: () => void;
}

type StepStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

interface InstallationStep {
  id: string;
  label: string;
  status: StepStatus;
}

export function InstallationProgressModal({
  isOpen,
  gameName,
  installError,
  progressPercent,
  status,
  serverId,
  permissionsSyncing = false,
  canOpenConsole = false,
  onClose,
  onOpenConsole,
  onRetryInstall,
}: InstallationProgressModalProps) {
  const normalizedStatus = (status ?? 'pending').toLowerCase();

  const installationStatus: 'installing' | 'success' | 'failed' = useMemo(() => {
    if (installError && normalizedStatus !== 'completed') return 'failed';
    if (normalizedStatus === 'failed') return 'failed';
    if (normalizedStatus === 'completed') return 'success';
    return 'installing';
  }, [installError, normalizedStatus]);

  const progress = useMemo(() => {
    if (typeof progressPercent === 'number' && Number.isFinite(progressPercent)) {
      return Math.max(0, Math.min(100, progressPercent));
    }

    switch (normalizedStatus) {
      case 'downloading':
        return 10;
      case 'extracting':
        return 35;
      case 'installing':
        return 70;
      case 'completed':
        return 100;
      case 'failed':
        return 0;
      default:
        return 0;
    }
  }, [progressPercent, normalizedStatus]);

  const steps: InstallationStep[] = useMemo(() => {
    if (normalizedStatus === 'failed') {
      return [
        { id: 'pull-image', label: 'Pulling container image', status: 'failed' },
        { id: 'create-container', label: 'Creating and starting container', status: 'failed' },
        { id: 'install-files', label: 'Installing server files (in-container)', status: 'failed' },
        { id: 'configure', label: 'Applying initial configuration', status: 'failed' },
      ];
    }

    if (normalizedStatus === 'completed') {
      return [
        { id: 'pull-image', label: 'Pulling container image', status: 'completed' },
        { id: 'create-container', label: 'Creating and starting container', status: 'completed' },
        {
          id: 'install-files',
          label: 'Installing server files (in-container)',
          status: 'completed',
        },
        { id: 'configure', label: 'Applying initial configuration', status: 'completed' },
      ];
    }

    switch (normalizedStatus) {
      case 'downloading':
        return [
          { id: 'pull-image', label: 'Pulling container image', status: 'in-progress' },
          { id: 'create-container', label: 'Creating and starting container', status: 'pending' },
          {
            id: 'install-files',
            label: 'Installing server files (in-container)',
            status: 'pending',
          },
          { id: 'configure', label: 'Applying initial configuration', status: 'pending' },
        ];
      case 'extracting':
        return [
          { id: 'pull-image', label: 'Pulling container image', status: 'completed' },
          {
            id: 'create-container',
            label: 'Creating and starting container',
            status: 'in-progress',
          },
          {
            id: 'install-files',
            label: 'Installing server files (in-container)',
            status: 'pending',
          },
          { id: 'configure', label: 'Applying initial configuration', status: 'pending' },
        ];
      case 'installing':
        return [
          { id: 'pull-image', label: 'Pulling container image', status: 'completed' },
          { id: 'create-container', label: 'Creating and starting container', status: 'completed' },
          {
            id: 'install-files',
            label: 'Installing server files (in-container)',
            status: 'in-progress',
          },
          { id: 'configure', label: 'Applying initial configuration', status: 'pending' },
        ];
      default:
        return [
          { id: 'pull-image', label: 'Pulling container image', status: 'in-progress' },
          { id: 'create-container', label: 'Creating and starting container', status: 'pending' },
          {
            id: 'install-files',
            label: 'Installing server files (in-container)',
            status: 'pending',
          },
          { id: 'configure', label: 'Applying initial configuration', status: 'pending' },
        ];
    }
  }, [normalizedStatus]);

  if (!isOpen) return null;

  const textPrimary = 'text-white';
  const textSecondary = 'text-gray-400';
  const bgOverlay = 'bg-black/70';
  const bgModal = 'bg-[#111827]';
  const borderColor = 'border-gray-700';
  const buttonSecondary = 'bg-gray-700 hover:bg-gray-600';

  const getStepIcon = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'in-progress':
        return <Loader2 className="w-5 h-5 text-[var(--color-cyan-400)] animate-spin" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <div className={`w-5 h-5 rounded-full border-2 ${borderColor}`} />;
    }
  };

  const canOpenLogs = Boolean(serverId) && canOpenConsole;
  const logsActionLabel = canOpenLogs ? 'Open Logs' : 'Preparing logs...';
  const logsActionIcon = canOpenLogs ? (
    <Terminal className="w-4 h-4" />
  ) : (
    <Loader2 className="w-4 h-4 animate-spin" />
  );

  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center ${bgOverlay}`}>
      <div
        className={`${bgModal} rounded-lg border ${borderColor} shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col`}
      >
        <div className={`px-6 py-5 border-b ${borderColor}`}>
          <h2 className={`text-2xl font-semibold ${textPrimary} mb-1`}>
            {installationStatus === 'success'
              ? `${gameName} Installation Started`
              : installationStatus === 'failed'
                ? `${gameName} Installation Failed`
                : `Installing ${gameName}`}
          </h2>
          <p className={`text-sm ${textSecondary}`}>
            {installationStatus === 'success'
              ? 'Installation has started. You can follow it in the logs.'
              : installationStatus === 'failed'
                ? 'An error occurred during setup.'
                : 'Please wait while the server is being set up.'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {installationStatus === 'installing' && (
            <>
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-sm font-medium ${textPrimary}`}>Overall Progress</span>
                  <span className={`text-sm ${textSecondary}`}>{Math.round(progress)}%</span>
                </div>
                <div className={`w-full h-2 bg-gray-700 rounded-full overflow-hidden`}>
                  <div
                    className="h-full bg-[#0050D7] transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div key={step.id} className="flex items-start gap-3">
                    <div className="mt-0.5">{getStepIcon(step.status)}</div>
                    <div className="flex-1">
                      <p
                        className={`text-sm font-medium ${
                          step.status === 'completed'
                            ? 'text-green-400'
                            : step.status === 'in-progress'
                              ? 'text-[var(--color-cyan-400)]'
                              : step.status === 'failed'
                                ? 'text-red-400'
                                : textSecondary
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {installationStatus === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className={`text-xl font-semibold ${textPrimary} mb-2`}>Installation started</h3>
              <p className={`${textSecondary} mb-6`}>
                You can follow the installation progress in the logs.
              </p>

              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={!canOpenLogs}
                  onClick={() => {
                    if (serverId) {
                      onOpenConsole?.(serverId);
                    }
                    onClose();
                  }}
                  className={`flex items-center gap-2 px-6 py-3 ${
                    canOpenLogs
                      ? `${buttonSecondary} ${textPrimary} hover:bg-opacity-80`
                      : 'bg-gray-700 text-gray-300 opacity-70 cursor-not-allowed'
                  } rounded-lg font-medium transition-all`}
                >
                  {logsActionIcon}
                  {permissionsSyncing && !canOpenLogs ? 'Preparing logs...' : logsActionLabel}
                </button>
              </div>
            </div>
          )}

          {installationStatus === 'failed' && (
            <div className="text-center py-8">
              <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h3 className={`text-xl font-semibold ${textPrimary} mb-2`}>Installation failed</h3>

              {installError && (
                <div
                  className={`bg-red-500/10 border-red-500/30 border rounded-lg p-4 mb-6 max-w-md mx-auto`}
                >
                  <p className={`text-sm text-red-300`}>{installError}</p>
                </div>
              )}

              <p className={`${textSecondary} mb-6`}>
                Please close this window and modify your server configuration before trying again.
              </p>

              <div className="flex gap-3 justify-center">
                {onRetryInstall && (
                  <button
                    onClick={onRetryInstall}
                    className="flex items-center gap-2 px-6 py-3 bg-[#0050D7] hover:bg-[#157EEA] hover:text-white text-white rounded-lg font-medium transition-all"
                  >
                    Reconfigure and Retry
                  </button>
                )}
                <button
                  onClick={onClose}
                  className={`flex items-center gap-2 px-6 py-3 ${buttonSecondary} ${textPrimary} rounded-lg font-medium transition-all`}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {installationStatus === 'failed' && (
          <div className={`px-6 py-4 border-t ${borderColor} flex justify-end`}>
            <button
              onClick={onClose}
              className={`px-4 py-2 ${buttonSecondary} ${textPrimary} rounded-lg font-medium transition-all text-sm`}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

