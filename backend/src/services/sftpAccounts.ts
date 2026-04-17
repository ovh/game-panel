import { request } from 'node:http';
import { getConfig } from '../config.js';
import { ensureServerDataDirs } from '../utils/storage.js';

const { gamepanelServersDir, appUser, hostAgentSocket } = getConfig();

function usernameForServer(serverId: number) {
    return `gp_s${serverId}`;
}

function chrootDirForServer(serverId: number) {
    return `${gamepanelServersDir}/${serverId}`;
}

function dataDirForServer(serverId: number) {
    return `${gamepanelServersDir}/${serverId}/data`;
}

type AgentRecord = Record<string, unknown>;

function toHttpError(statusCode: number, fallbackMessage: string): Error & { statusCode: number } {
    return Object.assign(new Error(fallbackMessage), { statusCode });
}

async function postToHostAgent<T extends AgentRecord = AgentRecord>(
    path: string,
    payload: AgentRecord
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const body = JSON.stringify(payload);

        const req = request(
            {
                method: 'POST',
                socketPath: hostAgentSocket,
                path,
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(body),
                },
            },
            (res) => {
                let raw = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    raw += chunk;
                });
                res.on('end', () => {
                    const status = res.statusCode ?? 500;
                    let parsed: AgentRecord = {};

                    if (raw.trim()) {
                        try {
                            parsed = JSON.parse(raw) as AgentRecord;
                        } catch {
                            reject(toHttpError(500, `Host agent returned invalid JSON for ${path}`));
                            return;
                        }
                    }

                    if (status >= 400) {
                        const message =
                            typeof parsed.error === 'string' && parsed.error.trim()
                                ? parsed.error
                                : `Host agent request failed (${status})`;
                        reject(toHttpError(status >= 500 ? 500 : status, message));
                        return;
                    }

                    if (parsed.data && typeof parsed.data === 'object') {
                        resolve(parsed.data as T);
                        return;
                    }

                    resolve(parsed as T);
                });
            }
        );

        req.on('error', (err: NodeJS.ErrnoException) => {
            const message =
                err.code === 'ENOENT'
                    ? `Host agent socket not found at ${hostAgentSocket}`
                    : `Host agent request failed: ${err.message}`;
            reject(toHttpError(503, message));
        });

        req.write(body);
        req.end();
    });
}

export async function ensureSftpUser(serverId: number): Promise<{ username: string }> {
    const username = usernameForServer(serverId);

    await postToHostAgent('/v1/sftp/ensure-user', { username });

    return { username };
}

export async function ensureChrootPermissions(serverId: number, username: string): Promise<void> {
    const chrootDir = chrootDirForServer(serverId);
    const dataDir = dataDirForServer(serverId);
    const backupDir = `${chrootDir}/backup`;

    await ensureServerDataDirs(serverId);

    await postToHostAgent('/v1/sftp/ensure-chroot-permissions', {
        username,
        chroot_dir: chrootDir,
        data_dir: dataDir,
        backup_dir: backupDir,
        app_user: appUser,
    });
}

export async function sftpUserHasPassword(username: string): Promise<boolean> {
    const result = await postToHostAgent<{ has_password?: unknown }>('/v1/sftp/has-password', { username });
    return result.has_password === true;
}

export async function setSftpPassword(username: string, password: string): Promise<void> {
    await postToHostAgent('/v1/sftp/set-password', { username, password });
}

export async function disableSftpUser(username: string): Promise<void> {
    await postToHostAgent('/v1/sftp/lock-user', { username });
}

export async function enableSftpUser(username: string): Promise<void> {
    await postToHostAgent('/v1/sftp/unlock-user', { username });
}

export async function writeSshdMatchFile(serverIds: number[]): Promise<void> {
    const entries = serverIds
        .sort((a, b) => a - b)
        .map((id) => ({
            username: usernameForServer(id),
            chroot_dir: chrootDirForServer(id),
        }));

    await postToHostAgent('/v1/sftp/write-sshd-match', { entries });
}

export async function deleteSftpUser(username: string): Promise<void> {
    await postToHostAgent('/v1/sftp/delete-user', { username });
}
