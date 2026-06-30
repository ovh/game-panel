import { useMemo, useRef, useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, Terminal, ExternalLink, User, ShieldCheck } from 'lucide-react';
import { AppButton } from '../src/ui/components';
import { useBodyScrollLock } from '../src/ui/utils/useBodyScrollLock';
import { useFocusTrap } from '../src/ui/utils/useFocusTrap';
import type { InstallInteraction, InstallStep } from '../types/gameServer';
import { getInstallStepLabel } from '../utils/installStepLabels';

interface InstallationProgressModalProps {
  isOpen: boolean;
  gameName: string;
  installing?: boolean;
  installError?: string | null;
  progressPercent?: number;
  status?: string | null;
  serverId?: number;
  installInteraction?: InstallInteraction | null;
  onRespondToInteraction?: (interactionId: number, response: Record<string, unknown>) => Promise<void>;
  installPlan?: InstallStep[];
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
  optional: boolean;
  status: StepStatus;
}

export function InstallationProgressModal({
  isOpen,
  gameName,
  installError,
  progressPercent,
  status,
  serverId,
  installInteraction,
  onRespondToInteraction,
  installPlan = [],
  permissionsSyncing = false,
  canOpenConsole = false,
  onClose,
  onOpenConsole,
  onRetryInstall,
}: InstallationProgressModalProps) {
  useBodyScrollLock(isOpen);

  const [selectedProfileUuid, setSelectedProfileUuid] = useState<string | null>(null);
  const [respondingToInteraction, setRespondingToInteraction] = useState(false);
  const [expiresInSec, setExpiresInSec] = useState<number | null>(null);

  useEffect(() => {
    if (!installInteraction?.expiresAt || installInteraction.status !== 'pending') {
      setExpiresInSec(null);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.floor((new Date(installInteraction.expiresAt).getTime() - Date.now()) / 1000));
      setExpiresInSec(remaining);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [installInteraction?.expiresAt, installInteraction?.status]);

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
    if (normalizedStatus === 'completed') return 100;
    return 0;
  }, [progressPercent, normalizedStatus]);

  const steps: InstallationStep[] = useMemo(() => {
    if (installPlan.length === 0) return [];

    if (normalizedStatus === 'completed') {
      return installPlan.map((step) => ({
        id: step.key,
        label: getInstallStepLabel(step.key),
        optional: step.optional,
        status: 'completed' as StepStatus,
      }));
    }

    if (normalizedStatus === 'failed') {
      return installPlan.map((step) => ({
        id: step.key,
        label: getInstallStepLabel(step.key),
        optional: step.optional,
        status: 'failed' as StepStatus,
      }));
    }

    const activeIndex = installPlan.findIndex((step) => step.key === normalizedStatus);

    return installPlan.map((step, i) => {
      let stepStatus: StepStatus;
      if (activeIndex === -1) {
        stepStatus = i === 0 ? 'in-progress' : 'pending';
      } else if (i < activeIndex) {
        stepStatus = 'completed';
      } else if (i === activeIndex) {
        stepStatus = 'in-progress';
      } else {
        stepStatus = 'pending';
      }
      return {
        id: step.key,
        label: getInstallStepLabel(step.key),
        optional: step.optional,
        status: stepStatus,
      };
    });
  }, [installPlan, normalizedStatus]);

  // Escape only dismisses once the install has settled (success/failed) — an
  // in-progress install intentionally has no quick close.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, dialogRef, {
    onEscape: installationStatus === 'installing' ? undefined : onClose,
  });

  if (!isOpen) return null;

  const textPrimary = 'text-white';
  const textSecondary = 'text-gray-400';
  const bgOverlay = 'bg-black/70';
  const bgModal = 'bg-gp-surface-card';
  const borderColor = 'border-gray-700';

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
  const logsActionLabel = canOpenLogs ? 'Open Logs / Console' : 'Preparing logs...';
  const logsActionIcon = canOpenLogs ? (
    <Terminal className="w-4 h-4" />
  ) : (
    <Loader2 className="w-4 h-4 animate-spin" />
  );

  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center ${bgOverlay}`}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gp-install-progress-title"
        tabIndex={-1}
        className={`gp-install-progress-dialog ${bgModal} rounded-lg border ${borderColor} shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col focus:outline-none`}
      >
        <div className={`px-6 py-5 border-b ${borderColor}`}>
          <h2 id="gp-install-progress-title" className={`text-2xl font-semibold ${textPrimary} mb-1`}>
            {installationStatus === 'success'
              ? `${gameName} Installation Started`
              : installationStatus === 'failed'
                ? `${gameName} Installation Failed`
                : `Installing ${gameName}`}
          </h2>
          {installationStatus !== 'success' && (
            <p className={`text-sm ${textSecondary}`}>
              {installationStatus === 'failed'
                ? 'An error occurred during setup.'
                : 'Please wait while the server is being set up.'}
            </p>
          )}
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
                    className="h-full bg-[var(--gp-ods-accent-primary)] transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-start gap-3">
                    <div className="mt-0.5">{getStepIcon(step.status)}</div>
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
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

              {/* ── Interaction panels ── */}
              {installInteraction?.status === 'pending' && installInteraction.kind === 'hytale_auth_required' && (() => {
                const p = installInteraction.payload as {
                  verificationUriComplete?: string;
                  verificationUri?: string;
                  userCode?: string;
                  purpose?: string;
                };
                const url = p.verificationUriComplete ?? p.verificationUri ?? '';
                const mins = expiresInSec !== null ? Math.ceil(expiresInSec / 60) : null;
                // The same interaction kind covers both the downloader auth and the
                // Hytale account auth; `purpose` lets us show a more specific subtitle.
                const authSubtitle =
                  p.purpose === 'downloader'
                    ? 'Authorize the download on your Hytale account'
                    : p.purpose === 'server_auth'
                    ? 'Authorize this server on your Hytale account'
                    : 'Authorize this request on your Hytale account';
                return (
                  <div className="mt-5 rounded-xl border border-amber-500/50 bg-amber-50 dark:border-yellow-500/30 dark:bg-yellow-500/8 p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/20 dark:bg-yellow-500/15 flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-yellow-300">Hytale Authentication Required</p>
                        <p className="text-xs text-amber-700/80 dark:text-yellow-400/70">
                          {authSubtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 rounded-lg bg-amber-100 border border-amber-500/40 dark:bg-black/30 dark:border-yellow-500/20 px-4 py-3 text-center">
                        <p className="text-xs text-amber-700/80 dark:text-yellow-400/60 mb-1 uppercase tracking-wider font-semibold">Your code</p>
                        <p className="text-2xl font-mono font-bold tracking-[0.3em] text-amber-900 dark:text-yellow-300">{p.userCode}</p>
                      </div>
                    </div>

                    <ol className="text-xs text-gray-700 dark:text-gray-300 space-y-1.5 mb-4">
                      <li className="flex gap-2"><span className="text-amber-600 dark:text-yellow-400 font-bold">1.</span> Click the button below to open the Hytale auth page</li>
                      <li className="flex gap-2"><span className="text-amber-600 dark:text-yellow-400 font-bold">2.</span> Enter the code above when prompted</li>
                      <li className="flex gap-2"><span className="text-amber-600 dark:text-yellow-400 font-bold">3.</span> The installation will resume automatically</li>
                    </ol>

                    <div className="flex items-center justify-between gap-3">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black dark:bg-yellow-500 dark:hover:bg-yellow-400 font-semibold text-sm transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open auth page
                      </a>
                      {mins !== null && (
                        <span className="text-xs text-amber-700/80 dark:text-yellow-400/60">
                          Expires in {mins} min
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {installInteraction?.status === 'pending' && installInteraction.kind === 'hytale_profile_selection_required' && (() => {
                const p = installInteraction.payload as {
                  profiles?: Array<{ uuid: string; username: string | null }>;
                };
                const profiles = p.profiles ?? [];
                return (
                  <div className="mt-5 rounded-xl border border-blue-500/30 bg-blue-500/8 p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-blue-300">Select Hytale Profile</p>
                        <p className="text-xs text-blue-400/70">Choose the profile to use for this server</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                      {profiles.map((profile) => (
                        <button
                          key={profile.uuid}
                          type="button"
                          onClick={() => setSelectedProfileUuid(profile.uuid)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                            selectedProfileUuid === profile.uuid
                              ? 'border-blue-400 bg-blue-500/20 text-white'
                              : 'border-gray-600 bg-white/5 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-blue-400" />
                          </div>
                          <span className="text-sm font-medium truncate">
                            {profile.username ?? profile.uuid.slice(0, 8)}
                          </span>
                          {selectedProfileUuid === profile.uuid && (
                            <CheckCircle className="w-4 h-4 text-blue-400 ml-auto flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>

                    <AppButton
                      tone="primary"
                      disabled={!selectedProfileUuid || respondingToInteraction}
                      onClick={async () => {
                        if (!selectedProfileUuid || !onRespondToInteraction) return;
                        setRespondingToInteraction(true);
                        try {
                          await onRespondToInteraction(installInteraction.id, { profileUuid: selectedProfileUuid });
                        } finally {
                          setRespondingToInteraction(false);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 transition-colors"
                    >
                      {respondingToInteraction ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Confirm profile
                    </AppButton>
                  </div>
                );
              })()}
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
                  className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all bg-[var(--gp-primary-700)] !text-white hover:bg-[var(--gp-primary-600)] disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <AppButton
                    tone="primary"
                    onClick={onRetryInstall}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all"
                  >
                    Reconfigure and Retry
                  </AppButton>
                )}
                <AppButton
                  tone="neutral"
                  onClick={onClose}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all"
                >
                  Close
                </AppButton>
              </div>
            </div>
          )}
        </div>

        {installationStatus === 'failed' && (
          <div className={`px-6 py-4 border-t ${borderColor} flex justify-end`}>
            <AppButton
              tone="neutral"
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium transition-all text-sm"
            >
              Close
            </AppButton>
          </div>
        )}
      </div>
    </div>
  );
}

