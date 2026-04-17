export interface ConsoleTerminalTarget {
  serverId: number;
  serverName: string;
}

export interface ActiveLogPromptToast {
  id: string;
  serverId: string;
  serverName: string;
  gameName: string;
  title: string;
  message: string;
  durationMs: number;
}

export interface LogPromptRule {
  gameKeys: string[];
  gameName: string;
  title: string;
  match: string;
  action: string;
}

export const LOG_PROMPT_REARM_MS = 5 * 60 * 1000;
export const LOG_PROMPT_TOAST_MS = 15000;
export const SERVER_LOG_HISTORY_LIMIT = 1000;
export const MAX_SERVER_LOG_LINES = 5000;

let notificationAudioContext: AudioContext | null = null;

export const normalizeCatalogLogPrompts = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const match = String((entry as { match?: unknown })?.match ?? '').trim();
      const action = String((entry as { action?: unknown })?.action ?? '').trim();
      const title = String((entry as { title?: unknown })?.title ?? '').trim();
      if (!match || !action) return null;
      return { match, action, title };
    })
    .filter((entry): entry is { match: string; action: string; title: string } => entry !== null);
};

export const normalizeGameIdentifier = (value: string) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

export async function playLogPromptNotificationSound() {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!notificationAudioContext) {
      notificationAudioContext = new AudioContextCtor();
    }

    const ctx = notificationAudioContext;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    masterGain.connect(ctx.destination);

    const toneA = ctx.createOscillator();
    toneA.type = 'sine';
    toneA.frequency.setValueAtTime(880, now);
    toneA.frequency.exponentialRampToValueAtTime(1046.5, now + 0.14);
    toneA.connect(masterGain);

    const toneB = ctx.createOscillator();
    toneB.type = 'triangle';
    toneB.frequency.setValueAtTime(1318.5, now + 0.1);
    toneB.connect(masterGain);

    toneA.start(now);
    toneA.stop(now + 0.16);
    toneB.start(now + 0.1);
    toneB.stop(now + 0.26);
  } catch {
    // Audio must never block the toast.
  }
}
