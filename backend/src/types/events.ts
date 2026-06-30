import type { ServerStatus } from './gameServer.js';
import type { InstallationInteractionRow, ServerActionRow } from './database.js';
import type { InstallStatus } from '../services/installPlan.js';
import type { SerializedFileTransferJob } from '../database/repositories/fileTransferJobRepository.js';

export interface ServerUpdatedEvent {
  serverId: number;
  timestamp?: string;
}

export interface ServerStatusEvent {
  serverId: number;
  status: ServerStatus;
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
  level: ServerActionRow['level'];
  message: string;
  actorUsername: string | null;
  timestamp?: string;
}

export interface ServerInstallProgressEvent {
  serverId: number;
  progress: number;
  status: InstallStatus;
  errorMessage: string | null;
  timestamp?: string;
}

export interface ServerInstallInteractionEvent {
  id: number;
  serverId: number;
  kind: string;
  status: InstallationInteractionRow['status'];
  payload: Record<string, unknown>;
  response: Record<string, unknown> | null;
  expiresAt: string | null;
  timestamp?: string;
}

export interface ServerFileTransferEvent {
  serverId: number;
  job: SerializedFileTransferJob;
  timestamp?: string;
}

export interface SystemRebootingEvent {
  byUserId?: number | null;
  timestamp?: string;
}
