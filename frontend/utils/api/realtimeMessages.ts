import { z } from 'zod';

/**
 * Catalogue of inbound realtime (WebSocket) message `type` discriminators the client
 * knows how to handle. Kept in sync with the switch in createWebSocketMessageHandler.
 * Exported as a typed union so the handler can be narrowed against it over time.
 */
export const REALTIME_MESSAGE_TYPES = [
  'auth:success',
  'auth:ok',
  'error',
  'system-metrics',
  'system-metrics:update',
  'system-metrics:history',
  'metrics:update',
  'metrics:history',
  'logs:history',
  'logs:container',
  'logs:new',
  'logs:container:new',
  'logs:subscribed',
  'actions:history',
  'actions:new',
  'servers:subscribed',
  'servers:snapshot',
  'servers:created',
  'servers:updated',
  'servers:deleted',
  'install:subscribed',
  'install:plan',
  'install:interaction',
  'install:progress',
] as const;

export type RealtimeMessageType = (typeof REALTIME_MESSAGE_TYPES)[number];

export type RealtimeMessage = { type: string } & Record<string, unknown>;

// Minimal envelope contract: every frame must be an object carrying a string `type`.
// Payload fields are intentionally left loose here — the handler still normalizes them —
// but this lets us detect malformed frames and protocol drift at the boundary.
const envelopeSchema = z.object({ type: z.string() });

const KNOWN_TYPES: ReadonlySet<string> = new Set(REALTIME_MESSAGE_TYPES);

export interface RealtimeParseResult {
  /** True when the frame is an object with a string `type`. */
  ok: boolean;
  /** True when `type` is one the client knows how to handle. */
  knownType: boolean;
  /** The original frame (unmodified) when `ok`. */
  message?: RealtimeMessage;
  reason?: string;
}

/**
 * Validates the envelope of a parsed WebSocket frame without mutating or dropping it.
 * Returns the original frame on success so callers can forward it unchanged while still
 * observing malformed/unknown frames (e.g. dev-time warnings for protocol drift).
 */
export function parseRealtimeMessage(data: unknown): RealtimeParseResult {
  const result = envelopeSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, knownType: false, reason: 'frame is not an object with a string `type`' };
  }
  const type = result.data.type;
  return {
    ok: true,
    knownType: KNOWN_TYPES.has(type),
    message: data as RealtimeMessage,
  };
}

export function isKnownRealtimeMessageType(type: string): type is RealtimeMessageType {
  return KNOWN_TYPES.has(type);
}
