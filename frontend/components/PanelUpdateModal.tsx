import { useState } from 'react';
import { ArrowUpCircle, CheckCircle2, RefreshCw, X, AlertTriangle } from 'lucide-react';
import {
  AppButton,
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
} from '../src/ui/components';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../utils/api';

interface PanelUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: {
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
  } | null;
}

type ModalState = 'idle' | 'starting' | 'started' | 'error';

export function PanelUpdateModal({ isOpen, onClose, updateInfo }: PanelUpdateModalProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [state, setState] = useState<ModalState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClose = () => {
    setState('idle');
    setErrorMessage(null);
    onClose();
  };

  const handleUpdate = async () => {
    if (!updateInfo?.latestVersion) return;
    setState('starting');
    setErrorMessage(null);
    try {
      await apiClient.startPanelUpdate(updateInfo.latestVersion);
      setState('started');
    } catch (err: unknown) {
      const message =
        (err as any)?.response?.data?.error ??
        (err instanceof Error ? err.message : 'Failed to start update');
      setErrorMessage(message);
      setState('error');
    }
  };

  const noUpdate = updateInfo && !updateInfo.updateAvailable && updateInfo.latestVersion !== null;
  const noLatest = updateInfo?.latestVersion === null;

  return (
    <AppModal open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AppModalContent
        dismissible={false}
        className={`z-[61] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-xl border shadow-xl ${
          isDark
            ? 'border-white/10 bg-[#0d1524]'
            : 'border-[#e2e8f0] bg-white'
        }`}
      >
        <AppModalHeader
          className={`flex items-center justify-between border-b px-5 py-4 ${
            isDark ? 'border-white/10 bg-[#101a2d]' : 'border-[#e2e8f0] bg-[#f8fafc]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-2 ${isDark ? 'bg-[#0050D7]/20' : 'bg-blue-50'}`}>
              <ArrowUpCircle className="h-5 w-5 text-[#157EEA]" />
            </div>
            <div>
              <AppModalTitle className={`text-base font-semibold ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                Panel Update
              </AppModalTitle>
            </div>
          </div>
          <AppButton
            type="button"
            tone="ghost"
            onClick={handleClose}
            className={`rounded border-none bg-transparent p-2 transition-colors ${
              isDark
                ? 'text-gray-400 hover:bg-gray-700 hover:text-red-400'
                : 'text-[#94a3b8] hover:bg-[#f0f4f8] hover:text-[#dc2626]'
            }`}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </AppButton>
        </AppModalHeader>

        <AppModalBody className="px-5 py-5">
          {/* Started state */}
          {state === 'started' && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className={`rounded-full p-3 ${isDark ? 'bg-green-500/10' : 'bg-green-50'}`}>
                <CheckCircle2 className="h-7 w-7 text-green-400" />
              </div>
              <div className="space-y-2">
                <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                  Update started
                </p>
                <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-[#475569]'}`}>
                  The panel may be unavailable for a few minutes.
                  <br />
                  Refresh this page after the service comes back.
                </p>
              </div>
              <AppButton
                type="button"
                tone="secondary"
                onClick={handleClose}
                className="mt-1 w-full !text-white"
              >
                Close
              </AppButton>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className={`shrink-0 rounded-full p-2 ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div className="space-y-1">
                  <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                    Update failed to start
                  </p>
                  <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-[#475569]'}`}>
                    {errorMessage}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <AppButton
                  type="button"
                  tone="ghost"
                  onClick={handleClose}
                  className="flex-1"
                >
                  Close
                </AppButton>
                <AppButton
                  type="button"
                  tone="secondary"
                  onClick={() => { setState('idle'); setErrorMessage(null); }}
                  className="flex-1 !text-white"
                >
                  Try again
                </AppButton>
              </div>
            </div>
          )}

          {/* Idle state — no update available or can't check */}
          {(state === 'idle' || state === 'starting') && (noUpdate || noLatest) && (
            <div className="flex flex-col gap-4">
              <div className={`rounded-lg border px-4 py-3 text-sm ${
                isDark ? 'border-white/10 bg-white/5 text-slate-300' : 'border-[#e2e8f0] bg-[#f8fafc] text-[#475569]'
              }`}>
                {noLatest
                  ? 'Up to date — no newer release found.'
                  : `Your panel is up to date — v${updateInfo!.currentVersion}`}
              </div>
              <AppButton type="button" tone="secondary" onClick={handleClose} className="w-full !text-white">
                Close
              </AppButton>
            </div>
          )}

          {/* Idle state — update available */}
          {(state === 'idle' || state === 'starting') && updateInfo?.updateAvailable && (
            <div className="flex flex-col gap-4">
              <div className={`rounded-lg border px-4 py-4 ${
                isDark ? 'border-white/10 bg-white/5' : 'border-[#e2e8f0] bg-[#f8fafc]'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-[#94a3b8]'}`}>
                      Current version
                    </p>
                    <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                      v{updateInfo.currentVersion}
                    </p>
                  </div>
                  <ArrowUpCircle className="h-5 w-5 text-[#157EEA]" />
                  <div className="space-y-0.5 text-right">
                    <p className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-[#94a3b8]'}`}>
                      Latest version
                    </p>
                    <p className="text-sm font-semibold text-[#157EEA]">
                      v{updateInfo.latestVersion}
                    </p>
                  </div>
                </div>
              </div>

              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-[#64748b]'}`}>
                The backend, frontend, and Traefik stack will restart during the update.
                HTTP requests and WebSocket connections may be interrupted. This is expected.
              </p>

              <div className="flex gap-2">
                <AppButton
                  type="button"
                  tone="ghost"
                  onClick={handleClose}
                  disabled={state === 'starting'}
                  className="flex-1"
                >
                  Cancel
                </AppButton>
                <AppButton
                  type="button"
                  tone="primary"
                  onClick={handleUpdate}
                  disabled={state === 'starting'}
                  className="flex-1 gap-2"
                >
                  {state === 'starting' ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Starting…
                    </>
                  ) : (
                    <>
                      <ArrowUpCircle className="h-4 w-4" />
                      Update to v{updateInfo.latestVersion}
                    </>
                  )}
                </AppButton>
              </div>
            </div>
          )}

          {/* No updateInfo yet — still loading */}
          {!updateInfo && (state === 'idle' || state === 'starting') && (
            <div className="flex flex-col gap-3 py-2">
              <div className={`h-16 animate-pulse rounded-lg ${isDark ? 'bg-white/5' : 'bg-[#f1f5f9]'}`} />
              <div className={`h-4 w-2/3 animate-pulse rounded ${isDark ? 'bg-white/5' : 'bg-[#f1f5f9]'}`} />
            </div>
          )}
        </AppModalBody>
      </AppModalContent>
    </AppModal>
  );
}
