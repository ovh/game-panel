export type GameServerStatus =
  | 'running'
  | 'stopped'
  | 'installing'
  | 'starting'
  | 'stopping'
  | 'restarting';

export interface GameServer {
  id: string;
  name: string;
  game: string;
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
  sftpUsername?: string | null;
  sftpEnabled?: boolean;
}
