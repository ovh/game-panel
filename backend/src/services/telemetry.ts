import { getConfig } from '../config.js';
import { getAppVersion } from '../utils/appInfo.js';
import { logError } from '../utils/logger.js';
import { nowIso } from '../utils/time.js';

const TELEMETRY_TIMEOUT_MS = 5_000;

type GameInstalledTelemetryInput = {
  serverId: number;
  gameKey: string;
};

function normalizeBaseUrl(value: string | null): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : null;
}

function getTelemetryConfig() {
  const config = getConfig();

  return {
    enabled: config.telemetryEnabled,
    baseUrl: normalizeBaseUrl(config.telemetryApiBaseUrl),
    instanceId: config.instanceId,
    instanceSecret: config.instanceSecret,
    frontendUrl: config.frontendUrl,
    version: getAppVersion(),
  };
}

function getPanelDomain(frontendUrl: string): string | null {
  try {
    return new URL(frontendUrl).hostname || null;
  } catch {
    return null;
  }
}

async function postJson(url: string, payload: unknown): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS);
  timeout.unref?.();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      let details = `${response.status} ${response.statusText}`;

      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === 'string' && body.error.trim()) {
          details = `${details}: ${body.error.trim()}`;
        }
      } catch {
        // Ignore body parsing errors and keep HTTP status details.
      }

      throw new Error(details);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function sendTelemetryRequest(url: string, payload: unknown, context: Record<string, unknown>): void {
  void postJson(url, payload).catch((error) => {
    logError('SERVICE:TELEMETRY:DELIVERY', error, context);
  });
}

export function sendGameInstalledTelemetry(input: GameInstalledTelemetryInput): void {
  const { enabled, baseUrl, instanceId, instanceSecret } = getTelemetryConfig();
  if (!enabled || !baseUrl || !instanceId || !instanceSecret) return;

  const at = nowIso();
  sendTelemetryRequest(
    `${baseUrl}/ingest/events`,
    {
      instanceId,
      instanceSecret,
      eventType: 'game.installed',
      gameKey: input.gameKey,
      at,
    },
    {
      instanceId,
      serverId: input.serverId,
      gameKey: input.gameKey,
      eventType: 'game.installed',
    }
  );
}

export function sendGameUninstalledTelemetry(input: GameInstalledTelemetryInput): void {
  const { enabled, baseUrl, instanceId, instanceSecret } = getTelemetryConfig();
  if (!enabled || !baseUrl || !instanceId || !instanceSecret) return;

  const at = nowIso();
  sendTelemetryRequest(
    `${baseUrl}/ingest/events`,
    {
      instanceId,
      instanceSecret,
      eventType: 'game.uninstalled',
      gameKey: input.gameKey,
      at,
    },
    {
      instanceId,
      serverId: input.serverId,
      gameKey: input.gameKey,
      eventType: 'game.uninstalled',
    }
  );
}
