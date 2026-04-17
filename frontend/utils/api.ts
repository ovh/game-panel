import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  CatalogGameItem,
  CatalogNewsItem,
  CatalogResourceItem,
  GameUpdateCronState,
  ReleaseConfigFileDefinition,
} from './api/types';
import { getFilenameFromDisposition, getPathFilename } from './api/helpers';
import { RealtimeGateway } from './api/realtimeGateway';
import {
  API_BASE_URL,
  AUTH_TOKEN_KEY,
  CATALOG_BASE_URL,
  clearCookieValue,
  getStoredToken,
  PUBLIC_CONNECTION_HOST,
  setCookieValue,
} from './api/runtime';

export type {
  CatalogGameItem,
  CatalogNewsItem,
  CatalogResourceItem,
  GameUpdateCronState,
  ReleaseConfigFileDefinition,
} from './api/types';
export { PUBLIC_CONNECTION_HOST } from './api/runtime';

class ApiClient {
  private client: AxiosInstance;
  private catalogClient: AxiosInstance;
  private token: string | null = null;
  private readonly realtime: RealtimeGateway;

  constructor() {
    this.realtime = new RealtimeGateway(() => this.getAuthToken());

    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 1800000, // 30 minutes timeout for very long installations
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.catalogClient = axios.create({
      baseURL: CATALOG_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.token = getStoredToken();
    if (this.token) {
      this.setAuthToken(this.token);
    }

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const status = error.response?.status;
        const requestUrl = String(error.config?.url || '').toLowerCase();
        const isAuthLoginRequest = requestUrl.includes('/api/auth/login');

        if (status === 401 && !isAuthLoginRequest) {
          this.clearAuth();
          window.location.href = '/';
        }
        return Promise.reject(error);
      }
    );
  }

  setAuthToken(token: string) {
    this.token = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setCookieValue(AUTH_TOKEN_KEY, token);
  }

  clearAuth() {
    this.token = null;
    delete this.client.defaults.headers.common['Authorization'];
    localStorage.removeItem(AUTH_TOKEN_KEY);
    clearCookieValue(AUTH_TOKEN_KEY);
    this.realtime.resetState();
    this.realtime.close();
  }

  getAuthToken(): string | null {
    return this.token || getStoredToken();
  }

  async login(username: string, password: string) {
    const response = await this.client.post('/api/auth/login', { username, password });
    const data = response.data as {
      success: true;
      user: {
        id: number;
        username: string;
        isRoot: boolean;
        isEnabled: boolean;
      };
      token: string;
    };

    if (typeof data.token === 'string' && data.token.length > 0) {
      this.setAuthToken(data.token);
    }

    return data;
  }

  async register(
    username: string,
    password: string,
    confirmPassword: string,
    globalPermissions?: string[]
  ) {
    const response = await this.client.post('/api/auth/register', {
      username,
      password,
      confirmPassword,
      ...(globalPermissions && globalPermissions.length > 0 ? { globalPermissions } : {}),
    });
    return response.data as {
      success: true;
      user: {
        id: number;
        username: string;
        isRoot: boolean;
        isEnabled: boolean;
        globalPermissions?: string[];
      };
    };
  }

  async getCurrentUser() {
    const response = await this.client.get('/api/auth/me');
    return response.data as {
      user: {
        id: number;
        username: string;
        isRoot: boolean;
        isEnabled: boolean;
      };
      permissions?: {
        global?: string[];
        servers?: Array<{
          serverId: number;
          permissions: string[];
        }>;
      };
    };
  }

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string) {
    const response = await this.client.post('/api/auth/change-password', {
      currentPassword,
      newPassword,
      confirmPassword,
    });
    return response.data;
  }

  logout() {
    this.clearAuth();
  }

  async listUsers() {
    const response = await this.client.get('/api/users');
    return response.data as {
      users: Array<{
        id: number;
        username: string;
        isRoot: boolean;
        isEnabled: boolean;
        globalPermissions: string[];
        createdAt: string;
        updatedAt: string;
      }>;
    };
  }

  async updateUser(
    userId: number,
    payload: Partial<{
      username: string;
      isEnabled: boolean;
      globalPermissions: string[];
    }>
  ) {
    const body: Record<string, unknown> = {};
    if (payload.username !== undefined) body.username = payload.username;
    if (payload.isEnabled !== undefined) body.is_enabled = payload.isEnabled;
    if (payload.globalPermissions !== undefined) body.globalPermissions = payload.globalPermissions;

    const response = await this.client.patch(`/api/users/${userId}`, body);
    return response.data as { success: boolean };
  }

  async resetUserPassword(userId: number, newPassword: string) {
    const response = await this.client.post(`/api/users/${userId}/reset-password`, { newPassword });
    return response.data as { success: boolean };
  }

  async createUser(
    username: string,
    password: string,
    confirmPassword: string,
    globalPermissions?: string[]
  ) {
    return this.register(username, password, confirmPassword, globalPermissions);
  }

  async deleteUser(userId: number) {
    const response = await this.client.delete(`/api/users/${userId}`);
    return response.data as { success: boolean };
  }

  async getServerMembers(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/members`);
    return response.data as {
      members: Array<{
        id: number;
        serverId: number;
        userId: number;
        username: string;
        permissions: string[];
        createdAt: string;
        updatedAt: string;
      }>;
    };
  }

  async addServerMember(serverId: number, userId: number, permissions: string[]) {
    const response = await this.client.post(`/api/servers/${serverId}/members`, {
      userId,
      permissions,
    });
    return response.data as { success: boolean };
  }

  async updateServerMember(serverId: number, userId: number, permissions: string[]) {
    const response = await this.client.patch(`/api/servers/${serverId}/members/${userId}`, {
      permissions,
    });
    return response.data as { success: boolean };
  }

  async removeServerMember(serverId: number, userId: number) {
    const response = await this.client.delete(`/api/servers/${serverId}/members/${userId}`);
    return response.data as { success: boolean };
  }

  async installServer(
    gameKey: string,
    serverName: string,
    gameServerName: string,
    ports?: { tcp?: Record<string, number>; udp?: Record<string, number> },
    portLabels?: { tcp?: Record<string, string>; udp?: Record<string, string> },
    healthcheck?: { type: string; port?: number; name?: string },
    requireSteamCredentials?: boolean,
    steamUsername?: string,
    steamPassword?: string
  ) {
    const payload: any = {
      gameKey,
      serverName,
      gameServerName,
    };

    if (ports) {
      payload.ports = ports;
    }

    if (portLabels) {
      payload.portLabels = portLabels;
    }

    if (healthcheck) {
      payload.healthcheck = healthcheck;
    }

    if (requireSteamCredentials) {
      payload.requireSteamCredentials = true;
      payload.steamUsername = steamUsername;
      payload.steamPassword = steamPassword;
    }

    const response = await this.client.post('/api/servers/install', payload);
    return response.data;
  }

  async getCatalogGames() {
    const response = await this.catalogClient.get('/games');
    return response.data as {
      games: CatalogGameItem[];
    };
  }

  async getCatalogGame(shortname: string) {
    const response = await this.catalogClient.get(`/games/${encodeURIComponent(shortname)}`);
    const raw = response.data as { game?: CatalogGameItem } | CatalogGameItem;
    return ((raw as { game?: CatalogGameItem })?.game ?? raw) as CatalogGameItem;
  }

  async getNews(limit: number = 10) {
    const response = await this.catalogClient.get('/news', {
      params: {
        limit,
      },
    });
    return response.data as {
      news: CatalogNewsItem[];
    };
  }

  async getResources(params: { category?: string; gameKey?: string; limit?: number } = {}) {
    const response = await this.catalogClient.get('/resources', {
      params: {
        ...(params.category ? { category: params.category } : {}),
        ...(params.gameKey ? { gameKey: params.gameKey } : {}),
        ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
      },
    });
    return response.data as {
      resources: CatalogResourceItem[];
    };
  }

  async startServer(id: number) {
    const response = await this.client.post(`/api/servers/${id}/start`);
    return response.data;
  }

  async stopServer(id: number) {
    const response = await this.client.post(`/api/servers/${id}/stop`);
    return response.data;
  }

  async restartServer(id: number) {
    const response = await this.client.post(`/api/servers/${id}/restart`);
    return response.data;
  }

  async updateServer(serverId: number, payload: { serverName?: string }) {
    const response = await this.client.patch(`/api/servers/${serverId}`, payload);
    return response.data as { success?: boolean; server?: { id: number; name?: string } };
  }

  async deleteServer(id: number) {
    const response = await this.client.delete(`/api/servers/${id}`);
    return response.data as { success?: boolean; message?: string };
  }

  async createTerminalSession(id: number) {
    const response = await this.client.post(`/api/servers/${id}/terminal/sessions`);
    return response.data as { sessionId: string };
  }

  async createConsoleTerminalSession(id: number) {
    const response = await this.client.post(`/api/servers/${id}/terminal/console/sessions`);
    return response.data as { sessionId: string };
  }

  async getServer(id: number) {
    const response = await this.client.get(`/api/servers/${id}`);
    const raw = response.data?.server ?? response.data;
    return raw as {
      id: number;
      name: string;
      game: string;
      port?: number;
      status: string;
      sftp_username?: string;
      sftp_enabled?: number;
      configFiles?: ReleaseConfigFileDefinition[] | string[] | string | null;
      config_files?: ReleaseConfigFileDefinition[] | string[] | string | null;
      config_files_json?: string | null;
    };
  }

  async setSftpPassword(serverId: number, password: string) {
    const response = await this.client.post(`/api/servers/${serverId}/sftp/password`, { password });
    return response.data;
  }

  async enableSftp(serverId: number) {
    const response = await this.client.post(`/api/servers/${serverId}/sftp/enable`);
    return response.data;
  }

  async disableSftp(serverId: number) {
    const response = await this.client.post(`/api/servers/${serverId}/sftp/disable`);
    return response.data;
  }

  async listBackups(serverId: number, path: string = '/') {
    const response = await this.client.get(`/api/servers/${serverId}/backups`, {
      params: { path },
    });
    return response.data as {
      path: string;
      entries: Array<{
        name: string;
        type: 'file' | 'dir' | 'symlink';
        size: number;
        modifiedAt: string;
      }>;
    };
  }

  async downloadBackupFile(serverId: number, path: string) {
    const response = await this.client.get(`/api/servers/${serverId}/backups/file`, {
      params: { path, download: 1 },
      responseType: 'blob',
    });

    const disposition = response.headers?.['content-disposition'] as string | undefined;
    const filename = getFilenameFromDisposition(disposition, getPathFilename(path, 'backup'));

    return { blob: response.data as Blob, filename };
  }

  async deleteBackupFile(serverId: number, path: string) {
    const response = await this.client.delete(`/api/servers/${serverId}/backups/file`, {
      params: { path },
    });
    return response.data;
  }

  async createBackup(serverId: number) {
    const response = await this.client.post(`/api/servers/${serverId}/backups/create`);
    return response.data as { ok: boolean; exitCode: number; stdout?: string; stderr?: string };
  }

  async getBackupSettings(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/backups/settings`);
    return response.data as { maxbackups: number; maxbackupdays: number; stoponbackup: boolean };
  }

  async updateBackupSettings(
    serverId: number,
    payload: Partial<{ maxbackups: number; maxbackupdays: number; stoponbackup: boolean }>
  ) {
    const response = await this.client.patch(`/api/servers/${serverId}/backups/settings`, payload);
    return response.data as { maxbackups: number; maxbackupdays: number; stoponbackup: boolean };
  }

  async getBackupCron(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/backups/cron`);
    return response.data as { enabled: false } | { enabled: true; schedule: string; line: string };
  }

  async updateBackupCron(
    serverId: number,
    payload: { enabled: false } | { enabled: true; schedule: string }
  ) {
    const response = await this.client.patch(`/api/servers/${serverId}/backups/cron`, payload);
    return response.data as { enabled: false } | { enabled: true; schedule: string; line?: string };
  }

  async getGameUpdateCron(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/gameupdate/cron`);
    return response.data as GameUpdateCronState;
  }

  async updateGameUpdateCron(serverId: number, enabled: boolean) {
    const response = await this.client.post(`/api/servers/${serverId}/gameupdate/cron`, {
      enabled,
    });
    return response.data as GameUpdateCronState;
  }

  async listServerFiles(serverId: number, path: string = '/') {
    const response = await this.client.get(`/api/servers/${serverId}/files`, {
      params: { path },
    });
    return response.data as {
      path: string;
      entries: Array<{
        name: string;
        type: 'dir' | 'file' | 'symlink';
        size: number;
        modifiedAt: string;
      }>;
    };
  }

  async readServerFile(serverId: number, path: string) {
    const response = await this.client.get(`/api/servers/${serverId}/file`, {
      params: { path },
      responseType: 'text',
    });
    return response.data as string;
  }

  async downloadServerFile(serverId: number, path: string) {
    const response = await this.client.get(`/api/servers/${serverId}/file`, {
      params: { path, download: 1 },
      responseType: 'blob',
    });

    const disposition = response.headers?.['content-disposition'] as string | undefined;
    const filename = getFilenameFromDisposition(disposition, getPathFilename(path, 'download'));

    return { blob: response.data as Blob, filename };
  }

  async updateServerFile(serverId: number, path: string, content: string) {
    const response = await this.client.put(
      `/api/servers/${serverId}/file`,
      { content },
      { params: { path } }
    );
    return response.data;
  }

  async createServerDirectory(serverId: number, path: string, name: string) {
    const response = await this.client.post(`/api/servers/${serverId}/files/mkdir`, {
      path,
      name,
    });
    return response.data;
  }

  async createServerFile(serverId: number, path: string, name: string, content: string) {
    const response = await this.client.post(`/api/servers/${serverId}/files/touch`, {
      path,
      name,
      content,
    });
    return response.data;
  }

  async renameServerPath(serverId: number, from: string, to: string) {
    const response = await this.client.post(`/api/servers/${serverId}/files/rename`, {
      from,
      to,
    });
    return response.data;
  }

  async deleteServerPaths(serverId: number, paths: string[]) {
    const response = await this.client.post(`/api/servers/${serverId}/files/delete`, {
      paths,
    });
    return response.data;
  }

  async startGameServer(id: string | number) {
    return this.startServer(Number(id));
  }

  async stopGameServer(id: string | number) {
    return this.stopServer(Number(id));
  }

  async restartGameServer(id: string | number) {
    return this.restartServer(Number(id));
  }

  connectWebSocket(onMessage?: (data: any) => void): Promise<void> {
    return this.realtime.connect(onMessage);
  }

  sendWebSocketMessage(message: any) {
    this.realtime.send(message);
  }

  addWebSocketListener(listener: (data: any) => void) {
    this.realtime.addListener(listener);
  }

  removeWebSocketListener(listener: (data: any) => void) {
    this.realtime.removeListener(listener);
  }

  subscribeLogs(serverId: number, limit?: number) {
    this.realtime.subscribeLogs(serverId, limit);
  }

  unsubscribeLogs(serverId: number) {
    this.realtime.unsubscribeLogs(serverId);
  }

  subscribeActions(serverId: number, limit?: number) {
    this.realtime.subscribeActions(serverId, limit);
  }

  unsubscribeActions(serverId: number) {
    this.realtime.unsubscribeActions(serverId);
  }

  subscribeMetrics(serverId: number, limit?: number) {
    this.realtime.subscribeMetrics(serverId, limit);
  }

  unsubscribeMetrics(serverId: number) {
    this.realtime.unsubscribeMetrics(serverId);
  }

  subscribeSystemMetrics(limit?: number) {
    this.realtime.subscribeSystemMetrics(limit);
  }

  unsubscribeSystemMetrics() {
    this.realtime.unsubscribeSystemMetrics();
  }

  subscribeInstall(serverId: number) {
    this.realtime.subscribeInstall(serverId);
  }

  unsubscribeInstall(serverId: number) {
    this.realtime.unsubscribeInstall(serverId);
  }

  subscribeServers() {
    this.realtime.subscribeServers();
  }

  subscribeConsoleStatus(serverId: number) {
    this.realtime.subscribeConsoleStatus(serverId);
  }

  unsubscribeConsoleStatus(serverId: number) {
    this.realtime.unsubscribeConsoleStatus(serverId);
  }

  sendServerAction(serverId: number, action: 'start' | 'stop' | 'restart') {
    this.realtime.sendServerAction(serverId, action);
  }

  createAuthenticatedWebSocket(): Promise<WebSocket> {
    return this.realtime.createAuthenticatedWebSocket();
  }

  closeWebSocket() {
    this.realtime.close();
  }

  getWebSocketUrl(): string {
    return this.realtime.getWebSocketUrl();
  }
}

export const apiClient = new ApiClient();
