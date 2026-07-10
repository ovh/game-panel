import { z } from 'zod';

/** Inbound realtime (WebSocket) message `type` discriminators the client handles. */
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

/** Validates a parsed WebSocket frame's envelope, returning it unmodified on success. */
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
