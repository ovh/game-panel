export interface InstallStep {
  key: string;
  optional: boolean;
}

export interface InstallInteraction {
  id: number;
  serverId: number;
  kind: 'hytale_auth_required' | 'hytale_profile_selection_required';
  status: 'pending' | 'completed' | 'failed' | 'expired' | 'cancelled';
  payload: Record<string, unknown>;
  response: Record<string, unknown> | null;
  expiresAt: string;
  timestamp: string;
}

// Online players for one server, pushed by the `servers-players` channel. Every field is
// independently nullable — a missing field means "not available", never zero.
export interface ServerPlayers {
  online: number | null;
  max: number | null;
  names: string[] | null;
}

export type GameServerStatus =
  | 'running'
  | 'stopped'
  | 'creating'
  | 'installing'
  | 'starting'
  | 'stopping'
  | 'restarting'
  | 'unhealthy'
  | 'failed';

export interface GameServer {
  id: string;
  name: string;
  game: string;
  provider?: string;
  catalogId?: string;
  port?: number;
  portMappings?: {
    tcp: number[];
    udp: number[];
  };
  portLabels?: {
    tcp: Record<string, string>;
    udp: Record<string, string>;
  };
  status: GameServerStatus;
  dockerContainerId?: string | null;
  installStatus?: string | null;
  installProgress?: number | null;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  networkIn?: number;
  networkOut?: number;
  desiredState?: string;
  containerStatus?: string;
  healthStatus?: string;
  lastError?: string | null;
  providerMetadataJson?: string | null;
  resourceLimits?: { memoryMb: number; cpu: number } | null;
}
