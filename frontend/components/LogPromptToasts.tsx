import { useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';

interface LogPromptToastItem {
  id: string;
  serverId: string;
  serverName: string;
  gameName: string;
  title: string;
  message: string;
  durationMs: number;
}

interface LogPromptToastsProps {
  toasts: LogPromptToastItem[];
  onClose: (toastId: string) => void;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/gi;
const TOAST_TICK_MS = 100;

function renderMessageWithLinks(message: string) {
  const parts = String(message ?? '').split(URL_PATTERN);

  return parts.map((part, index) => {
    if (!part) return null;
    if (part.match(/^https?:\/\/[^\s]+$/i)) {
      return (
        <a
          key={`link-${index}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="break-all font-medium text-cyan-300 underline decoration-cyan-500/60 underline-offset-2 transition-colors hover:text-cyan-200"
        >
          {part}
        </a>
      );
    }

    return <span key={`text-${index}`}>{part}</span>;
  });
}

function LogPromptToastCard({
  toast,
  onClose,
}: {
  toast: LogPromptToastItem;
  onClose: (toastId: string) => void;
}) {
  const [remainingMs, setRemainingMs] = useState(toast.durationMs);
  const [isPaused, setIsPaused] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const runStartedAtRef = useRef<number>(0);
  const remainingRef = useRef<number>(toast.durationMs);

  const clearTimers = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const pauseTimers = () => {
    if (runStartedAtRef.current > 0) {
      const elapsed = Date.now() - runStartedAtRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
      setRemainingMs(remainingRef.current);
    }
    runStartedAtRef.current = 0;
    clearTimers();
  };

  const startTimers = (duration: number) => {
    clearTimers();

    const safeDuration = Math.max(0, duration);
    remainingRef.current = safeDuration;
    setRemainingMs(safeDuration);

    if (safeDuration <= 0) {
      onClose(toast.id);
      return;
    }

    runStartedAtRef.current = Date.now();

    timeoutRef.current = window.setTimeout(() => {
      clearTimers();
      setRemainingMs(0);
      onClose(toast.id);
    }, safeDuration);

    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - runStartedAtRef.current;
      const next = Math.max(0, remainingRef.current - elapsed);
      setRemainingMs(next);
    }, TOAST_TICK_MS);
  };

  useEffect(() => {
    remainingRef.current = toast.durationMs;
    setRemainingMs(toast.durationMs);
    if (!isPaused) startTimers(toast.durationMs);
    return () => {
      clearTimers();
    };
  }, [toast.durationMs, toast.id]);

  useEffect(() => {
    if (isPaused) {
      pauseTimers();
      return;
    }

    startTimers(remainingRef.current);
    return () => {
      clearTimers();
    };
  }, [isPaused, onClose, toast.id]);

  const progress = toast.durationMs > 0 ? Math.max(0, Math.min(1, remainingMs / toast.durationMs)) : 0;
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));

  return (
    <div
      className="gp-log-prompt-toast pointer-events-auto overflow-hidden rounded-2xl border border-cyan-700/50 bg-[linear-gradient(180deg,rgba(9,19,35,0.98)_0%,rgba(6,13,25,0.98)_100%)] shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur"
      onPointerEnter={() => setIsPaused(true)}
      onPointerLeave={() => setIsPaused(false)}
    >
      <div className="h-1 w-full bg-cyan-950/70">
        <div
          className="gp-log-prompt-toast-bar h-full bg-[linear-gradient(90deg,#22d3ee_0%,#0891b2_100%)] transition-[width] duration-100 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="flex items-start gap-4 p-4 sm:p-5">
        <div className="gp-log-prompt-toast-icon mt-0.5 rounded-xl bg-cyan-500/10 p-2.5 text-cyan-300 ring-1 ring-cyan-400/20">
          <BellRing className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
              {toast.title}
            </span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/75">
              {toast.gameName}
            </span>
            <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-300">
              {secondsLeft}s
            </span>
          </div>

          <div className="mb-3">
            <p className="text-base font-semibold text-white">{toast.serverName}</p>
          </div>

          <div className="rounded-xl border border-white/6 bg-white/4 px-3.5 py-3">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">
              {renderMessageWithLinks(toast.message)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onClose(toast.id)}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function LogPromptToasts({ toasts, onClose }: LogPromptToastsProps) {
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[62] flex w-[calc(100%-2rem)] max-w-md flex-col gap-3 sm:bottom-6 sm:right-6">
      {toasts.map((toast) => (
        <LogPromptToastCard key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}

