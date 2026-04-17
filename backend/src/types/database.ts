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
  status: string;
  error_message: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServerMetricRow {
  id: number;
  server_id: number;
  cpu_usage: number;
  memory_usage: number;
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
