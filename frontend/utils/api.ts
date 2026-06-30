import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  ReleaseConfigFileDefinition,
} from './api/types';
import { getFilenameFromDisposition, getPathFilename } from './api/helpers';
import { RealtimeGateway, type RealtimeConnectionStatus } from './api/realtimeGateway';
import {
  API_BASE_URL,
  AUTH_TOKEN_KEY,
  CATALOG_BASE_URL,
  clearCookieValue,
  getStoredToken,
  setCookieValue,
} from './api/runtime';

export type {
  CatalogNewsItem,
  CatalogResourceItem,
  ReleaseConfigFileDefinition,
} from './api/types';
export { PUBLIC_CONNECTION_HOST } from './api/runtime';
export type { RealtimeConnectionStatus } from './api/realtimeGateway';

// Normal requests fail fast; only the explicitly long-running install/upload/restore
// and large download calls opt into the extended timeout via per-request config.
const DEFAULT_TIMEOUT_MS = 60_000;
const LONG_TIMEOUT_MS = 30 * 60 * 1000;

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private readonly realtime: RealtimeGateway;
  private unauthorizedHandler: (() => void) | null = null;

  constructor() {
    this.realtime = new RealtimeGateway(() => this.getAuthToken());

    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: DEFAULT_TIMEOUT_MS,
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
          // Prefer a React-level expiry signal (preserves the SPA and unsaved work);
          // fall back to a hard redirect only if no handler is registered.
          if (this.unauthorizedHandler) {
            this.unauthorizedHandler();
          } else {
            window.location.href = '/';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /** Register a callback invoked when a request is rejected with 401 (session
   *  expired/revoked), so the app can reset to the login screen in-place instead
   *  of doing a full page reload. */
  setUnauthorizedHandler(handler: (() => void) | null) {
    this.unauthorizedHandler = handler;
  }

  onConnectionStatusChange(listener: (status: RealtimeConnectionStatus) => void): () => void {
    return this.realtime.onStatusChange(listener);
  }

  getConnectionStatus(): RealtimeConnectionStatus {
    return this.realtime.getStatus();
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
    const data = response.data as {
      success: true;
      message?: string;
      token?: string;
    };
    // The backend bumps the user's token_version on password change, which
    // invalidates every previously issued JWT (including the one this session
    // is currently using). It returns a fresh token carrying the new version;
    // store it so the current session keeps working instead of getting a 401
    // on the very next request.
    if (typeof data.token === 'string' && data.token.length > 0) {
      this.setAuthToken(data.token);
    }
    return data;
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
    if (payload.isEnabled !== undefined) body.isEnabled = payload.isEnabled;
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

  async installServer(payload: {
    provider: 'ovhcloud' | 'linuxgsm' | 'external';
    name: string;
    shortname?: string;
    imageId?: string;
    dockerImage?: string;
    imageOptions?: { patchline?: string; profileUuid?: string | null };
    runtimeIdentity?: { user: string; uid: number; gid: number };
    ports: {
      tcp: { host: number; container: number; label: string }[];
      udp: { host: number; container: number; label: string }[];
    };
    healthcheck: null | { mode: 'disabled' } | { mode: 'override'; type: string; port?: number; interval?: number; timeout?: number; retries?: number; startPeriod?: number };
    mounts?: { key: string; containerPath: string }[];
    env?: Record<string, string>;
    requireSteamCredentials?: boolean;
    steamUsername?: string;
    steamPassword?: string;
    resourceLimits?: { memoryMb: number; cpu: number } | null;
  }) {
    const response = await this.client.post('/api/servers/install', payload, {
      timeout: LONG_TIMEOUT_MS,
    });
    return response.data;
  }

  async respondToInstallInteraction(serverId: number, interactionId: number, response: Record<string, unknown>) {
    const res = await this.client.post(`/api/servers/${serverId}/install/interactions/${interactionId}/respond`, response);
    return res.data;
  }

  async getNews(limit?: number) {
    const response = await axios.get(`${CATALOG_BASE_URL}/news`, {
      params: { limit: limit ?? 20 },
    });
    return response.data as { news: import('./api/types').CatalogNewsItem[] };
  }

  async getResources(params?: { category?: string; gameKey?: string; limit?: number }) {
    const response = await axios.get(`${CATALOG_BASE_URL}/resources`, {
      params: {
        category: params?.category,
        gameKey: params?.gameKey,
        limit: params?.limit ?? 200,
      },
    });
    return response.data as { resources: import('./api/types').CatalogResourceItem[] };
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

  async updateServer(serverId: number, payload: {
    name?: string;
    ports?: {
      tcp: Array<{ host: number; container: number; label: string }>;
      udp: Array<{ host: number; container: number; label: string }>;
    };
    mounts?: Array<{ key: string; containerPath: string }>;
    env?: Record<string, string>;
    healthcheck?: null | { mode: string; [key: string]: unknown };
    deleteHostData?: boolean;
    resourceLimits?: { memoryMb: number; cpu: number } | null;
  }) {
    const response = await this.client.patch(`/api/servers/${serverId}`, payload);
    return response.data as { success?: boolean; server?: { id: number; name?: string } };
  }

  async deleteServer(id: number) {
    const response = await this.client.delete(`/api/servers/${id}`);
    return response.data as { success?: boolean; message?: string };
  }

  async createTerminalSession(id: number) {
    const response = await this.client.post(`/api/servers/${id}/terminal/container/sessions`);
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
      configFiles?: ReleaseConfigFileDefinition[] | string[] | string | null;
      config_files?: ReleaseConfigFileDefinition[] | string[] | string | null;
      config_files_json?: string | null;
    };
  }

  async listBackups(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/backups`);
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

  async restoreBackup(serverId: number, path: string) {
    const response = await this.client.post(`/api/servers/${serverId}/backups/restore`, { path }, {
      timeout: LONG_TIMEOUT_MS,
    });
    return response.data as { ok: boolean; exitCode: number; stdout?: string; stderr?: string };
  }

  async sendConsoleCommand(serverId: number, command: string) {
    const response = await this.client.post(`/api/servers/${serverId}/console/commands`, { command });
    return response.data as { ok: boolean; exitCode: number; stdout: string; stderr: string };
  }

  async downloadBackupFile(serverId: number, path: string) {
    const response = await this.client.get(`/api/servers/${serverId}/backups/file`, {
      params: { path, download: 1 },
      responseType: 'blob',
      timeout: LONG_TIMEOUT_MS,
    });

    const disposition = response.headers?.['content-disposition'] as string | undefined;
    const filename = getFilenameFromDisposition(disposition, getPathFilename(path, 'backup'));

    return { blob: response.data as Blob, filename };
  }

  async renameBackupFile(serverId: number, path: string, name: string) {
    const response = await this.client.patch(`/api/servers/${serverId}/backups/file`, { path, name });
    return response.data as { path: string; name: string };
  }

  async deleteBackupFile(serverId: number, path: string) {
    const response = await this.client.delete(`/api/servers/${serverId}/backups/file`, {
      params: { path },
    });
    return response.data;
  }

  async createBackup(serverId: number, options?: { includeServerArtifact?: boolean }) {
    const response = await this.client.post(`/api/servers/${serverId}/backups/create`, options ?? {}, {
      timeout: LONG_TIMEOUT_MS,
    });
    return response.data as { ok: boolean; exitCode: number; stdout?: string; stderr?: string };
  }

  async getBackupSettings(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/backups/settings`);
    return response.data as { maxBackups: number; maxBackupDays: number; stopOnBackup: boolean };
  }

  async updateBackupSettings(
    serverId: number,
    payload: Partial<{ maxBackups: number; maxBackupDays: number; stopOnBackup: boolean }>
  ) {
    const response = await this.client.patch(`/api/servers/${serverId}/backups/settings`, payload);
    return response.data as { maxBackups: number; maxBackupDays: number; stopOnBackup: boolean };
  }

  async getBackupCron(serverId: number) {
    try {
      const response = await this.client.get(`/api/servers/${serverId}/scheduled-tasks`);
      const tasks = (response.data?.tasks ?? []) as Array<{
        id: number;
        type: string;
        schedule: string;
        enabled: boolean;
      }>;
      const task = tasks.find((t) => t.type === 'backup');
      if (!task || !task.enabled) return { enabled: false as const };
      return { enabled: true as const, schedule: task.schedule, line: task.schedule };
    } catch {
      return { enabled: false as const };
    }
  }

  async updateBackupCron(
    serverId: number,
    payload: { enabled: false } | { enabled: true; schedule: string }
  ) {
    const listResponse = await this.client.get(`/api/servers/${serverId}/scheduled-tasks`);
    const tasks = (listResponse.data?.tasks ?? []) as Array<{
      id: number;
      type: string;
      enabled: boolean;
      schedule: string;
    }>;
    const existingTask = tasks.find((t) => t.type === 'backup');

    if (!payload.enabled) {
      if (existingTask) {
        await this.client.patch(
          `/api/servers/${serverId}/scheduled-tasks/${existingTask.id}`,
          { enabled: false }
        );
      }
      return { enabled: false as const };
    }

    if (existingTask) {
      const response = await this.client.patch(
        `/api/servers/${serverId}/scheduled-tasks/${existingTask.id}`,
        { schedule: payload.schedule, enabled: true }
      );
      return {
        enabled: true as const,
        schedule: response.data?.task?.schedule ?? payload.schedule,
      };
    }

    const response = await this.client.post(`/api/servers/${serverId}/scheduled-tasks`, {
      type: 'backup',
      schedule: payload.schedule,
      enabled: true,
    });
    return {
      enabled: true as const,
      schedule: response.data?.task?.schedule ?? payload.schedule,
    };
  }

  async getCatalogGames(): Promise<{ games: any[] }> {
    try {
      const res = await fetch(`${CATALOG_BASE_URL}/linuxgsm/metadata`);
      if (!res.ok) return { games: [] };
      const body = await res.json() as { items?: Array<{ shortname: string; serverFiles: ReleaseConfigFileDefinition[] | null; requireSteamCredentials?: boolean; requireGameCopy?: boolean }> };
      const items = body?.items ?? [];
      return {
        games: items.map((item) => ({
          shortname: item.shortname,
          gameservername: item.shortname,
          gamename: item.shortname,
          configFiles: item.serverFiles ?? [],
          requireSteamCredentials: item.requireSteamCredentials ?? false,
          requireGameCopy: item.requireGameCopy ?? false,
        })),
      };
    } catch {
      return { games: [] };
    }
  }

  async getCatalogGame(gameKey: string): Promise<any> {
    if (!gameKey) return null;
    try {
      const res = await fetch(
        `${CATALOG_BASE_URL}/linuxgsm/metadata/${encodeURIComponent(gameKey)}`
      );
      if (!res.ok) return null;
      const data = await res.json() as {
        shortname: string;
        ports?: {
          tcp?: Array<{ host: number; container: number; label?: string }>;
          udp?: Array<{ host: number; container: number; label?: string }>;
        } | null;
        healthcheck?: Record<string, unknown> | null;
        serverFiles: ReleaseConfigFileDefinition[] | null;
        requireSteamCredentials?: boolean;
        requireGameCopy?: boolean;
        logPrompts?: Array<{ match: string; action: string; title?: string }>;
      };
      if (!data?.shortname) return null;
      return {
        shortname: data.shortname,
        gameservername: data.shortname,
        gamename: data.shortname,
        ports: data.ports ?? null,
        healthcheck: data.healthcheck ?? null,
        configFiles: data.serverFiles ?? [],
        requireSteamCredentials: data.requireSteamCredentials ?? false,
        requireGameCopy: data.requireGameCopy ?? false,
        logPrompts: data.logPrompts ?? [],
      };
    } catch {
      return null;
    }
  }

  async getScheduledTasks(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/scheduled-tasks`);
    return response.data as {
      tasks: Array<{
        id: number;
        serverId: number;
        type: 'restart' | 'backup' | 'custom';
        schedule: string;
        enabled: boolean;
        payload: Record<string, unknown>;
        nextRunAt: string | null;
        lastRunAt: string | null;
        lastStatus: string | null;
        lastError: string | null;
      }>;
    };
  }

  async createScheduledTask(
    serverId: number,
    payload: {
      type: 'restart' | 'backup' | 'custom';
      schedule: string;
      enabled?: boolean;
      payload?: Record<string, unknown>;
    }
  ) {
    const response = await this.client.post(`/api/servers/${serverId}/scheduled-tasks`, payload);
    return response.data;
  }

  async updateScheduledTask(
    serverId: number,
    taskId: number,
    payload: { type?: string; schedule?: string; enabled?: boolean; payload?: Record<string, unknown> }
  ) {
    const response = await this.client.patch(
      `/api/servers/${serverId}/scheduled-tasks/${taskId}`,
      payload
    );
    return response.data;
  }

  async deleteScheduledTask(serverId: number, taskId: number) {
    const response = await this.client.delete(
      `/api/servers/${serverId}/scheduled-tasks/${taskId}`
    );
    return response.data;
  }

  async listServerFileRoots(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/files/roots`);
    return response.data as {
      roots: Array<{ key: string; containerPath: string }>;
    };
  }

  async listServerFiles(serverId: number, path: string = '/', root?: string) {
    const response = await this.client.get(`/api/servers/${serverId}/files`, {
      params: { path, ...(root ? { root } : {}) },
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

  async readServerFile(serverId: number, path: string, root?: string) {
    const response = await this.client.get(`/api/servers/${serverId}/file`, {
      params: { path, ...(root ? { root } : {}) },
      responseType: 'text',
    });
    return response.data as string;
  }

  async downloadServerFile(serverId: number, path: string, root?: string) {
    const response = await this.client.get(`/api/servers/${serverId}/file`, {
      params: { path, download: 1, ...(root ? { root } : {}) },
      responseType: 'blob',
      timeout: LONG_TIMEOUT_MS,
    });

    const disposition = response.headers?.['content-disposition'] as string | undefined;
    const filename = getFilenameFromDisposition(disposition, getPathFilename(path, 'download'));

    return { blob: response.data as Blob, filename };
  }

  async downloadServerPath(serverId: number, path: string, root?: string) {
    const response = await this.client.get(`/api/servers/${serverId}/files/download`, {
      params: { path, ...(root ? { root } : {}) },
      responseType: 'blob',
      timeout: LONG_TIMEOUT_MS,
    });

    const disposition = response.headers?.['content-disposition'] as string | undefined;
    const filename = getFilenameFromDisposition(disposition, getPathFilename(path, 'download'));

    return { blob: response.data as Blob, filename };
  }

  async updateServerFile(serverId: number, path: string, content: string, root?: string) {
    const response = await this.client.put(
      `/api/servers/${serverId}/file`,
      { content },
      { params: { path, ...(root ? { root } : {}) } }
    );
    return response.data;
  }

  async createServerDirectory(serverId: number, path: string, name: string, root?: string) {
    const response = await this.client.post(`/api/servers/${serverId}/files/mkdir`, {
      path,
      name,
      ...(root ? { root } : {}),
    });
    return response.data;
  }

  async createServerFile(serverId: number, path: string, name: string, content: string, root?: string) {
    const response = await this.client.post(`/api/servers/${serverId}/files/touch`, {
      path,
      name,
      content,
      ...(root ? { root } : {}),
    });
    return response.data;
  }

  async renameServerPath(serverId: number, from: string, to: string, root?: string) {
    const response = await this.client.post(`/api/servers/${serverId}/files/rename`, {
      from,
      to,
      ...(root ? { root } : {}),
    });
    return response.data;
  }

  async deleteServerPaths(serverId: number, paths: string[], root?: string) {
    const response = await this.client.post(`/api/servers/${serverId}/files/delete`, {
      paths,
      ...(root ? { root } : {}),
    });
    return response.data;
  }

  async uploadServerFile(
    serverId: number,
    destDir: string,
    relativePath: string,
    file: File,
    onProgress?: (percent: number) => void,
    root?: string
  ) {
    const SMALL_LIMIT = 64 * 1024 * 1024;
    // destDir is the directory the upload is anchored to (always exists); relativePath is the
    // file's path relative to it (e.g. "mymod/sub/file.txt"). The backend recreates any missing
    // parent directories (ensureParentDirsWithOwnership), so dragging a folder keeps its structure.
    const baseDir = destDir.replace(/\/$/, '') || '';
    const destPath = `${baseDir}/${relativePath}`;

    if (file.size <= SMALL_LIMIT) {
      await this.client.put(`/api/servers/${serverId}/files/upload`, file, {
        params: { path: destPath, overwrite: '1', ...(root ? { root } : {}) },
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: LONG_TIMEOUT_MS,
        onUploadProgress: (e) =>
          onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
      });
    } else {
      const CHUNK_SIZE = 16 * 1024 * 1024;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      // Anchor the session at destDir (which exists, satisfying the server's ensureIsDir check) and
      // let the chunk relativePath carry the nested sub-folders the backend will mkdir -p.
      const dirPath = baseDir || '/';

      const sessionRes = await this.client.post(
        `/api/servers/${serverId}/files/upload-sessions`,
        { path: dirPath, totalBytes: file.size, totalFiles: 1, overwrite: true, ...(root ? { root } : {}) },
        { timeout: LONG_TIMEOUT_MS }
      );
      const uploadId = sessionRes.data?.upload?.id as number;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
        await this.client.put(
          `/api/servers/${serverId}/files/upload-sessions/${uploadId}/chunks`,
          chunk,
          {
            params: {
              relativePath,
              chunkIndex: i,
              totalChunks,
              fileSize: file.size,
              ...(root ? { root } : {}),
            },
            headers: { 'Content-Type': 'application/octet-stream' },
            timeout: LONG_TIMEOUT_MS,
            onUploadProgress: (e) => {
              const chunkPct = e.total ? e.loaded / e.total : 0;
              onProgress?.(Math.round(((i + chunkPct) / totalChunks) * 100));
            },
          }
        );
      }

      await this.client.post(
        `/api/servers/${serverId}/files/upload-sessions/${uploadId}/complete`,
        undefined,
        { timeout: LONG_TIMEOUT_MS }
      );
    }
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

  // ── Panel updates ────────────────────────────────────────────────────────

  async checkPanelUpdate(): Promise<{
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
  }> {
    const response = await this.client.get('/api/system/update/check');
    return response.data as { currentVersion: string; latestVersion: string | null; updateAvailable: boolean };
  }

  async startPanelUpdate(version: string): Promise<{
    started: boolean;
    jobId: number;
    targetVersion: string;
  }> {
    const response = await this.client.post('/api/system/update', { version });
    return response.data as { started: boolean; jobId: number; targetVersion: string };
  }

  // ── Minecraft Java OVHcloud ──────────────────────────────────────────────

  async getMinecraftSettings(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/minecraft/settings`);
    return response.data as {
      settings: Array<{
        key: string; label: string; description: string;
        type: 'select' | 'integer' | 'boolean' | 'string';
        options?: string[]; min?: number; max?: number;
        value: string | number | boolean;
      }>;
    };
  }

  async patchMinecraftSettings(serverId: number, settings: Record<string, string | number | boolean>) {
    const response = await this.client.patch(`/api/servers/${serverId}/minecraft/settings`, { settings });
    return response.data as { updated: string[]; settings: Array<unknown> };
  }

  async getMinecraftOperators(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/minecraft/operators`);
    return response.data as {
      operators: Array<{ uuid: string; name: string; level: number; bypassesPlayerLimit: boolean }>;
    };
  }

  async addMinecraftOperator(serverId: number, name: string) {
    const response = await this.client.post(`/api/servers/${serverId}/minecraft/operators`, { name });
    return response.data;
  }

  async removeMinecraftOperator(serverId: number, name: string) {
    const response = await this.client.delete(`/api/servers/${serverId}/minecraft/operators/${encodeURIComponent(name)}`);
    return response.data;
  }

  async getMinecraftWhitelist(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/minecraft/whitelist`);
    return response.data as {
      whitelist: { enabled: boolean; players: Array<{ uuid: string; name: string }> };
    };
  }

  async patchMinecraftWhitelist(serverId: number, enabled: boolean) {
    const response = await this.client.patch(`/api/servers/${serverId}/minecraft/whitelist`, { enabled });
    return response.data;
  }

  async addMinecraftWhitelistPlayer(serverId: number, name: string) {
    const response = await this.client.post(`/api/servers/${serverId}/minecraft/whitelist/players`, { name });
    return response.data;
  }

  async removeMinecraftWhitelistPlayer(serverId: number, name: string) {
    const response = await this.client.delete(`/api/servers/${serverId}/minecraft/whitelist/players/${encodeURIComponent(name)}`);
    return response.data;
  }

  async getMinecraftPlayerBans(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/minecraft/bans/players`);
    return response.data as {
      bans: Array<{ name: string; uuid?: string; reason?: string; created?: string; expires?: string; source?: string }>;
    };
  }

  async banMinecraftPlayer(serverId: number, name: string, reason?: string) {
    const response = await this.client.post(`/api/servers/${serverId}/minecraft/bans/players`, { name, ...(reason ? { reason } : {}) });
    return response.data;
  }

  async unbanMinecraftPlayer(serverId: number, name: string) {
    const response = await this.client.delete(`/api/servers/${serverId}/minecraft/bans/players/${encodeURIComponent(name)}`);
    return response.data;
  }

  async getMinecraftIpBans(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/minecraft/bans/ips`);
    return response.data as {
      bans: Array<{ ip: string; reason?: string; created?: string; expires?: string; source?: string }>;
    };
  }

  async banMinecraftIp(serverId: number, target: string, reason?: string) {
    const response = await this.client.post(`/api/servers/${serverId}/minecraft/bans/ips`, { target, ...(reason ? { reason } : {}) });
    return response.data;
  }

  async unbanMinecraftIp(serverId: number, ip: string) {
    const response = await this.client.delete(`/api/servers/${serverId}/minecraft/bans/ips/${encodeURIComponent(ip)}`);
    return response.data;
  }

  // ── Hytale OVHcloud ───────────────────────────────────────────────────────

  async getHytaleSettings(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/hytale/settings`);
    return response.data as {
      settings: Array<{
        key: string; label: string; description: string;
        type: 'integer' | 'boolean' | 'string';
        min?: number; max?: number;
        value: string | number | boolean;
      }>;
    };
  }

  async patchHytaleSettings(serverId: number, settings: Record<string, string | number | boolean>) {
    const response = await this.client.patch(`/api/servers/${serverId}/hytale/settings`, { settings });
    return response.data as { updated: string[]; settings: Array<unknown> };
  }

  // ── Counter-Strike 2 OVHcloud ─────────────────────────────────────────────

  async getCS2Frameworks(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/counter-strike-2/frameworks`);
    return response.data as {
      frameworks: {
        metamodInstalled: boolean;
        counterStrikeSharpInstalled: boolean;
      };
    };
  }

  async installCS2Metamod(serverId: number, options?: { version?: string; gameinfoMode?: string }) {
    const response = await this.client.post(`/api/servers/${serverId}/counter-strike-2/metamod/install`, options ?? {}, {
      timeout: LONG_TIMEOUT_MS,
    });
    return response.data as { ok: boolean; exitCode: number; stdout: string; stderr: string; restarted: boolean };
  }

  async installCS2CounterStrikeSharp(serverId: number, options?: { version?: string; releaseFlavor?: string; gameinfoMode?: string }) {
    const response = await this.client.post(`/api/servers/${serverId}/counter-strike-2/counterstrikesharp/install`, options ?? {}, {
      timeout: LONG_TIMEOUT_MS,
    });
    return response.data as { ok: boolean; exitCode: number; stdout: string; stderr: string; restarted: boolean };
  }

  // ── Mods / Addons shared upload helper ───────────────────────────────────

  async uploadModFile(
    serverId: number,
    file: File,
    routeBase: string,
    onProgress?: (percent: number) => void
  ) {
    const SMALL_LIMIT = 64 * 1024 * 1024;

    if (file.size <= SMALL_LIMIT) {
      await this.client.put(`/api/servers/${serverId}/${routeBase}/upload`, file, {
        params: { path: `/${file.name}` },
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: LONG_TIMEOUT_MS,
        onUploadProgress: (e) =>
          onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
      });
    } else {
      const CHUNK_SIZE = 16 * 1024 * 1024;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      const sessionRes = await this.client.post(
        `/api/servers/${serverId}/${routeBase}/upload-sessions`,
        { totalBytes: file.size, totalFiles: 1, overwrite: true },
        { timeout: LONG_TIMEOUT_MS }
      );
      const sessionId = sessionRes.data?.upload?.id as number;

      try {
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
          await this.client.put(
            `/api/servers/${serverId}/${routeBase}/upload-sessions/${sessionId}/chunks`,
            chunk,
            {
              params: { relativePath: file.name, chunkIndex: i, totalChunks, fileSize: file.size },
              headers: { 'Content-Type': 'application/octet-stream' },
              timeout: LONG_TIMEOUT_MS,
              onUploadProgress: (e) => {
                const chunkPct = e.total ? e.loaded / e.total : 0;
                onProgress?.(Math.round(((i + chunkPct) / totalChunks) * 100));
              },
            }
          );
        }
        await this.client.post(
          `/api/servers/${serverId}/${routeBase}/upload-sessions/${sessionId}/complete`,
          undefined,
          { timeout: LONG_TIMEOUT_MS }
        );
      } catch (err) {
        await this.client.delete(
          `/api/servers/${serverId}/${routeBase}/upload-sessions/${sessionId}`
        ).catch(() => {});
        throw err;
      }
    }
  }

  // ── Hytale mods ──────────────────────────────────────────────────────────

  async listHytaleMods(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/hytale/mods`);
    return response.data as {
      entries: Array<{ name: string; type: string; size: number; modifiedAt: string }>;
    };
  }

  async uploadHytaleMod(serverId: number, file: File, onProgress?: (percent: number) => void) {
    return this.uploadModFile(serverId, file, 'hytale/mods', onProgress);
  }

  async deleteHytaleMods(serverId: number, paths: string[]) {
    const response = await this.client.delete(`/api/servers/${serverId}/hytale/mods`, {
      data: { paths },
    });
    return response.data;
  }

  // ── Minecraft addons ─────────────────────────────────────────────────────

  async listMinecraftAddons(serverId: number) {
    const response = await this.client.get(`/api/servers/${serverId}/minecraft/addons`);
    return response.data as {
      entries: Array<{ name: string; type: string; size: number; modifiedAt: string }>;
    };
  }

  async uploadMinecraftAddon(serverId: number, file: File, onProgress?: (percent: number) => void) {
    return this.uploadModFile(serverId, file, 'minecraft/addons', onProgress);
  }

  async deleteMinecraftAddons(serverId: number, paths: string[]) {
    const response = await this.client.delete(`/api/servers/${serverId}/minecraft/addons`, {
      data: { paths },
    });
    return response.data;
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
