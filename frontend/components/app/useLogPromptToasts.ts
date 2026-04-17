import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { stripAnsi } from '../../utils/ansi';
import type { GameServer } from '../../types/gameServer';
import {
  type ActiveLogPromptToast,
  type LogPromptRule,
  LOG_PROMPT_REARM_MS,
  LOG_PROMPT_TOAST_MS,
  normalizeGameIdentifier,
  playLogPromptNotificationSound,
} from './appRuntime';

interface UseLogPromptToastsArgs {
  gameNamesByKey: Record<string, string>;
  logPromptRules: LogPromptRule[];
  serversRef: MutableRefObject<GameServer[]>;
}

export function useLogPromptToasts({
  gameNamesByKey,
  logPromptRules,
  serversRef,
}: UseLogPromptToastsArgs) {
  const [activeLogPromptToasts, setActiveLogPromptToasts] = useState<ActiveLogPromptToast[]>([]);
  const recentLogPromptMatchesRef = useRef<Record<string, number>>({});

  const clearRecentLogPromptMatchesForServer = useCallback((serverId: string) => {
    Object.keys(recentLogPromptMatchesRef.current).forEach((key) => {
      if (key.startsWith(`${serverId}|`)) {
        delete recentLogPromptMatchesRef.current[key];
      }
    });
  }, []);

  const removeLogPromptToast = useCallback((toastId: string) => {
    setActiveLogPromptToasts((prev) => prev.filter((toast) => toast.id !== toastId));
  }, []);

  const pushLogPromptToast = useCallback((toast: Omit<ActiveLogPromptToast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setActiveLogPromptToasts((prev) => [...prev, { ...toast, id }].slice(-4));
    window.setTimeout(() => {
      void playLogPromptNotificationSound();
    }, 0);
  }, []);

  const maybeCreateLogPromptToast = useCallback(
    (serverId: string, rawMessage: string) => {
      const server = serversRef.current.find((entry) => entry.id === serverId);
      if (!server) return false;

      const normalizedServerGame = normalizeGameIdentifier(server.game);
      if (!normalizedServerGame) return false;

      const promptsForServer = logPromptRules.filter((rule) =>
        rule.gameKeys.some(
          (key) =>
            key === normalizedServerGame ||
            key.includes(normalizedServerGame) ||
            normalizedServerGame.includes(key)
        )
      );
      if (promptsForServer.length === 0) return false;

      const cleanMessage = stripAnsi(rawMessage).trim();
      if (!cleanMessage) return false;

      const normalizedMessage = cleanMessage.toLowerCase();
      const now = Date.now();

      Object.keys(recentLogPromptMatchesRef.current).forEach((key) => {
        if (now - recentLogPromptMatchesRef.current[key] >= LOG_PROMPT_REARM_MS) {
          delete recentLogPromptMatchesRef.current[key];
        }
      });

      for (const prompt of promptsForServer) {
        const normalizedMatch = prompt.match.trim().toLowerCase();
        if (!normalizedMatch || !normalizedMessage.includes(normalizedMatch)) {
          continue;
        }

        const dedupeKey = `${serverId}|${normalizedMatch}|${prompt.action}|${normalizedMessage}`;
        const previousSeenAt = recentLogPromptMatchesRef.current[dedupeKey];
        if (previousSeenAt && now - previousSeenAt < LOG_PROMPT_REARM_MS) {
          continue;
        }

        recentLogPromptMatchesRef.current[dedupeKey] = now;

        pushLogPromptToast({
          serverId,
          serverName: server.name || `Server ${serverId}`,
          gameName: gameNamesByKey[server.game] || prompt.gameName || server.game,
          title: prompt.title || 'Action required',
          message: prompt.action,
          durationMs: LOG_PROMPT_TOAST_MS,
        });
        return true;
      }
      return false;
    },
    [gameNamesByKey, logPromptRules, pushLogPromptToast, serversRef]
  );

  return {
    activeLogPromptToasts,
    setActiveLogPromptToasts,
    clearRecentLogPromptMatchesForServer,
    removeLogPromptToast,
    maybeCreateLogPromptToast,
  };
}
