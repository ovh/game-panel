import { apiClient } from './api';

// Admin page (Super Admins): one CoD4 server's live players and RCON, maps, mods / maps on disk, B3, activity log.
export type LivePlayer = { slot: number; score: number; ping: string; guid: string; steamId: string; name: string; ip: string | null };
export type LiveStatus = {
  online: boolean;
  hostname: string | null;
  map: string | null;
  gametype: string | null;
  maxPlayers: number | null;
  players: LivePlayer[];
  rcon: boolean;
  rconError: string | null;
};
export type MapsInfo = { stock: string[]; usermaps: string[]; gametypes: string[]; rotation: string };
export type ContentItem = { name: string; size: number; files: number };
export type B3Plugins = { config: string; plugins: Array<{ name: string; enabled: boolean; config: string | null }>; extplugins: string[] };
export type B3Group = { id: string; name: string; keyword: string; level: string };
export type B3Client = { id: string; name: string; guid: string; group_bits: string; connections: string; last_seen: string };
export type B3Ban = { id: string; type: string; reason: string; added: string; expires: string; player: string; guid: string; admin: string };
export type AdminSettings = {
  cod4Defaults: { slots: number; mod: string; fastdl: boolean; b3: boolean; serverCfg: string };
  autoBackup: { enabled: boolean; hour: number; keep: number; lastRun: number | null };
};
export type BackupItem = { kind: 'configs' | 'b3'; path: string; size: number; time: number };
export type B3DatabaseRow = { serverId: number; serverName: string; database: string | null; user: string | null; size: number | null; error: string | null };
export type DatabasesInfo = { dbRunning: boolean; phpMyAdmin: { url: string | null; container: string } | null; databases: B3DatabaseRow[] };
export type Cod4FilesInfo = {
  ready: boolean;
  folder: string;
  hostFolder: string;
  problems: string[];
  summary: { iwd: number; zone: number; mods: number; usermaps: number; dedrunTime: number | null };
  size: number | null;
  servers: Array<{ id: number; name: string }>;
  refresh: { running: boolean; serverId: number | null; startedAt: number | null; finishedAt: number | null; linked: number; copied: number; error: string | null };
};
export type PanelTheme = 'orange' | 'cyan' | 'dark' | 'light';
export type ActivityEntry = { time: number; user: string | null; method: string; path: string; status: number; detail?: string };

const req = apiClient.adminRequest.bind(apiClient);

export const adminApi = {
  live: (id: string) => req<LiveStatus>('get', `/servers/${id}/live`),
  rcon: (id: string, command: string) => req<{ output: string }>('post', `/servers/${id}/rcon`, { command }),
  player: (id: string, slot: number, action: 'kick' | 'tempban' | 'ban', reason: string, minutes?: number) =>
    req<{ output: string }>('post', `/servers/${id}/players/${slot}/${action}`, { reason, minutes }),
  say: (id: string, message: string) => req<{ output: string }>('post', `/servers/${id}/say`, { message }),
  maps: (id: string) => req<MapsInfo>('get', `/servers/${id}/maps`),
  changeMap: (id: string, map: string, gametype?: string) => req<{ output: string }>('post', `/servers/${id}/map`, { map, gametype }),
  nextMap: (id: string) => req<{ output: string }>('post', `/servers/${id}/map`, { rotate: true }),
  saveRotation: (id: string, entries: Array<{ gametype: string; map: string }>) =>
    req<{ rotation: string }>('put', `/servers/${id}/rotation`, { entries }),
  content: (id: string) => req<{ mods: ContentItem[]; usermaps: ContentItem[] }>('get', `/servers/${id}/content`),
  deleteContent: (id: string, section: string, name: string) => req<{ success: boolean }>('delete', `/servers/${id}/content/${section}/${encodeURIComponent(name)}`),
  copyContent: (id: string, section: string, name: string, targetId: string) =>
    req<{ success: boolean }>('post', `/servers/${id}/content/${section}/${encodeURIComponent(name)}/copy`, { targetId }),
  b3Action: (id: string, action: 'start' | 'stop' | 'restart') => req<{ success: boolean }>('post', `/servers/${id}/b3/${action}`),
  b3Plugins: (id: string) => req<B3Plugins>('get', `/servers/${id}/b3/plugins`),
  b3SetPlugin: (id: string, name: string, enabled: boolean, restart: boolean) =>
    req<{ success: boolean }>('post', `/servers/${id}/b3/plugins/${name}`, { enabled, restart }),
  b3Clients: (id: string, search: string) => req<{ groups: B3Group[]; clients: B3Client[] }>('get', `/servers/${id}/b3/clients`, undefined, { search }),
  b3SetGroup: (id: string, clientId: string, groupId: number) => req<{ success: boolean }>('put', `/servers/${id}/b3/clients/${clientId}/group`, { groupId }),
  b3Bans: (id: string) => req<{ bans: B3Ban[] }>('get', `/servers/${id}/b3/bans`),
  b3Unban: (id: string, banId: string) => req<{ success: boolean }>('post', `/servers/${id}/b3/bans/${banId}/unban`),
  b3Backup: (id: string) => req<{ file: string; size: number }>('post', `/servers/${id}/b3/backup`),
  b3Backups: (id: string) => req<{ backups: Array<{ file: string; size: number; time: number }> }>('get', `/servers/${id}/b3/backups`),
  b3Restore: (id: string, file: string) => req<{ success: boolean; restarted: boolean }>('post', `/servers/${id}/b3/restore`, { file }),
  b3AddPlugin: (id: string, name: string, restart: boolean) => req<{ success: boolean; config: string | null }>('post', `/servers/${id}/b3/plugins/${name}/add`, { restart }),
  b3UploadPlugin: (id: string, body: { name: string; code: string; configName?: string; config?: string; enable: boolean; restart: boolean }) =>
    req<{ success: boolean; added: boolean }>('post', `/servers/${id}/b3/plugins-upload`, body),
  serverCfg: (id: string) => req<{ file: string; exists: boolean; content: string }>('get', `/servers/${id}/servercfg`),
  saveServerCfg: (id: string, content: string) => req<{ success: boolean }>('put', `/servers/${id}/servercfg`, { content }),
  settings: () => req<AdminSettings>('get', '/settings'),
  saveSettings: (patch: { cod4Defaults?: Partial<AdminSettings['cod4Defaults']>; autoBackup?: Partial<AdminSettings['autoBackup']> }) =>
    req<AdminSettings>('put', '/settings', patch),
  backups: (id: string) => req<{ backups: BackupItem[]; b3: boolean }>('get', `/servers/${id}/backups`),
  backupConfigs: (id: string) => req<{ folder: string; files: number }>('post', `/servers/${id}/backups/configs`),
  restoreConfigs: (id: string, path: string) => req<{ success: boolean; files: number }>('post', `/servers/${id}/backups/configs/restore`, { path }),
  deleteBackup: (id: string, path: string) => req<{ success: boolean }>('delete', `/servers/${id}/backups`, undefined, { path }),
  runBackupsNow: () => req<{ servers: number; errors: string[] }>('post', '/backups/run-now'),
  databases: () => req<DatabasesInfo>('get', '/databases'),
  cod4Files: () => req<Cod4FilesInfo>('get', '/cod4-files'),
  refreshCod4Files: (serverId: number) => req<{ started: boolean }>('post', '/cod4-files/refresh', { serverId }),
  saveAppearance: (patch: { defaultTheme?: PanelTheme; loginFooter?: string }) =>
    req<{ name: string | null; defaultTheme: PanelTheme; loginFooter: string }>('put', '/appearance', patch),
  activity: (limit = 300) => req<{ entries: ActivityEntry[] }>('get', '/activity', undefined, { limit }),
};

export const apiError = (e: unknown, fallback: string): string =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e instanceof Error ? e.message : fallback);

// the overview with the CoD4 players the backend reads straight from each server
export type OverviewServer = {
  id: number;
  name: string;
  catalogId: string | null;
  status: string;
  desiredState: string | null;
  b3: { state: string; wanted: boolean; heartbeatAge: number | null } | null;
  fastdl: boolean | null;
  players?: { online: number; max: number | null; map: string | null } | null;
};
