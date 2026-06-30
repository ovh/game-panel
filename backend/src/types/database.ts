import type { InstallStatus } from '../services/installPlan.js';

export interface ServerActionRow {
  id: number;
  server_id: number;
  level: string;
  message: string;
  actor_username: string | null;
  timestamp: string;
}

export interface InstallationProgressRow {
  id: number;
  server_id: number;
  progress_percent: number;
  status: InstallStatus;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstallationInteractionRow {
  id: number;
  server_id: number;
  kind: string;
  status: 'pending' | 'completed' | 'failed' | 'expired' | 'cancelled';
  payload_json: string;
  response_json: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileTransferJobRow {
  id: number;
  server_id: number;
  kind: 'upload';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  root: string;
  base_path: string;
  total_bytes: number;
  transferred_bytes: number;
  total_files: number;
  completed_files: number;
  payload_json: string;
  artifact_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ScheduledTaskRow {
  id: number;
  server_id: number;
  type: 'restart' | 'backup' | 'custom';
  schedule: string;
  enabled: number;
  payload_json: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServerMetricRow {
  id: number;
  server_id: number;
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_in: number;
  network_out: number;
  timestamp: string;
}

export interface SystemMetricRow {
  id: number;
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_in: number;
  network_out: number;
  timestamp: string;
}

export interface PanelUpdateJobRow {
  id: number;
  target_version: string;
  target_tag: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  phase: string;
  message: string | null;
  error_message: string | null;
  container_id: string | null;
  backup_path: string | null;
  started_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}
