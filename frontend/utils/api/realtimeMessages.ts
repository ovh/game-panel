import { z } from 'zod';

export const REALTIME_MESSAGE_TYPES = [
  'auth:success',
  'auth:ok',
  'error',
  'system-metrics',
  'system-metrics:update',
  'system-metrics:history',
  'servers-metrics:subscribed',
  'servers-metrics:update',
  'servers-players:subscribed',
  'servers-players:update',
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

const envelopeSchema = z.object({ type: z.string() });

const KNOWN_TYPES: ReadonlySet<string> = new Set(REALTIME_MESSAGE_TYPES);

export interface RealtimeParseResult {
  ok: boolean;
  knownType: boolean;
  message?: RealtimeMessage;
  reason?: string;
}

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
