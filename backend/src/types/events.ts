import type { ServerStatus } from './gameServer.js';

export interface ServerUpdatedEvent {
  serverId: number;
  timestamp?: string;
}

export interface ServerStatusEvent {
  serverId: number;
  status: ServerStatus;
  timestamp?: string;
}

export interface ServerSftpEvent {
  serverId: number;
  timestamp?: string;
}

export interface ServerCreatedEvent {
  serverId: number;
  timestamp?: string;
}

export interface ServerDeletedEvent {
  serverId: number;
  timestamp?: string;
}

export interface ServerActionEvent {
  serverId: number;
  actionId: number | null;
  level: string;
  message: string;
  actorUsername: string | null;
  timestamp?: string;
}

export interface ServerInstallProgressEvent {
  serverId: number;
  progress: number;
  status: string;
  errorMessage: string | null;
  timestamp?: string;
}

export interface SystemRebootingEvent {
  byUserId?: number | null;
  timestamp?: string;
}
