import { promises as fs } from 'node:fs';
import path from 'node:path';
import { installInteractionRepository, installProgressRepository } from '../../../../database/index.js';
import { logError } from '../../../../utils/logger.js';
import type { ServerMountOwnership } from '../../../../utils/storage.js';
import type { OvhcloudHytaleMetadata } from '../../../serverMetadata.js';
import {
    CLIENT_ID,
    DEVICE_AUTH_URL,
    DOWNLOADER_PROMPT_KIND,
    INTERACTION_POLL_MS,
    PROFILE_PROMPT_KIND,
    PROFILES_URL,
    SCOPE,
    TOKEN_URL,
} from './constants.js';
import { formBody, normalizeOAuthTokens, requestJson } from './http.js';
import { chownRecursive, readJsonIfExists, writeJsonSecret } from './io.js';
import { hytalePaths } from './paths.js';
import type { HytalePaths, HytaleProfile, OAuthTokens } from './types.js';

async function startDeviceFlow(serverId: number): Promise<OAuthTokens> {
    const device = await requestJson(DEVICE_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody({
            client_id: CLIENT_ID,
            scope: SCOPE,
        }),
    });

    const expiresAt = new Date(Date.now() + Number(device.expires_in ?? 600) * 1000).toISOString();
    const interactionId = await installInteractionRepository.create({
        serverId,
        kind: DOWNLOADER_PROMPT_KIND,
        payload: {
            purpose: 'server_auth',
            verificationUri: device.verification_uri ?? null,
            verificationUriComplete: device.verification_uri_complete ?? null,
            userCode: device.user_code ?? null,
        },
        expiresAt,
    });
    await installProgressRepository.update(serverId, 40, 'hytale_account_auth');

    const intervalMs = Math.max(Number(device.interval ?? 5), 1) * 1000;
    const deadline = Date.now() + Number(device.expires_in ?? 600) * 1000;

    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));

        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formBody({
                client_id: CLIENT_ID,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                device_code: String(device.device_code),
            }),
        });

        const body = await response.json().catch(() => ({}));
        if (response.ok) {
            await installInteractionRepository.complete(interactionId);
            return normalizeOAuthTokens(body);
        }

        if (body?.error === 'authorization_pending') continue;
        if (body?.error === 'slow_down') {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
            continue;
        }

        await installInteractionRepository.fail(interactionId);
        throw new Error(`Hytale device flow failed: ${JSON.stringify(body)}`);
    }

    await installInteractionRepository.expire(interactionId);
    throw new Error('Hytale device code expired before authorization completed');
}

async function refreshOAuth(refreshToken: string): Promise<OAuthTokens> {
    const body = await requestJson(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody({
            client_id: CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    return normalizeOAuthTokens(body);
}

async function getProviderOAuthTokens(serverId: number, paths: HytalePaths): Promise<OAuthTokens> {
    const stored = await readJsonIfExists<OAuthTokens>(paths.providerOauthPath);

    try {
        const tokens = stored?.refresh_token
            ? await refreshOAuth(stored.refresh_token)
            : await startDeviceFlow(serverId);

        await writeJsonSecret(paths.providerOauthPath, tokens);
        return tokens;
    } catch (error) {
        if (!stored?.refresh_token) throw error;

        logError('HYTALE:OAUTH_REFRESH', error, { serverId });
        const tokens = await startDeviceFlow(serverId);
        await writeJsonSecret(paths.providerOauthPath, tokens);
        return tokens;
    }
}

async function getProfiles(accessToken: string): Promise<HytaleProfile[]> {
    const body = await requestJson(PROFILES_URL, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!Array.isArray(body?.profiles) || body.profiles.length === 0) {
        throw new Error(`No Hytale profiles returned: ${JSON.stringify(body ?? {})}`);
    }

    return body.profiles.map((profile: any) => ({
        uuid: String(profile.uuid),
        username: typeof profile.username === 'string' ? profile.username : null,
    }));
}

async function waitForInteractionResponse(
    interactionId: number,
    expiresAt: string
): Promise<Record<string, unknown>> {
    const deadline = Date.parse(expiresAt);

    while (Date.now() < deadline) {
        const row = await installInteractionRepository.findById(interactionId);
        if (!row) throw new Error('Installation interaction disappeared');
        if (row.status !== 'pending') {
            throw new Error(`Installation interaction ended with status ${row.status}`);
        }

        if (row.response_json) {
            try {
                return JSON.parse(row.response_json) as Record<string, unknown>;
            } catch {
                throw new Error('Installation interaction response is invalid JSON');
            }
        }

        await new Promise((resolve) => setTimeout(resolve, INTERACTION_POLL_MS));
    }

    await installInteractionRepository.expire(interactionId);
    throw new Error('Installation interaction expired before user response');
}

async function selectProfile(params: {
    serverId: number;
    paths: HytalePaths;
    metadata: OvhcloudHytaleMetadata;
    profiles: HytaleProfile[];
}): Promise<HytaleProfile> {
    const storedProfile = await readJsonIfExists<HytaleProfile>(params.paths.profilePath);
    const requestedUuid = params.metadata.profileUuid ?? storedProfile?.uuid ?? null;

    if (requestedUuid) {
        const selected = params.profiles.find((profile) => profile.uuid === requestedUuid);
        if (!selected) {
            throw new Error(`Selected Hytale profile UUID was not returned by Hytale: ${requestedUuid}`);
        }
        await writeJsonSecret(params.paths.profilePath, selected);
        return selected;
    }

    if (params.profiles.length === 1) {
        await writeJsonSecret(params.paths.profilePath, params.profiles[0]);
        return params.profiles[0];
    }

    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const interactionId = await installInteractionRepository.create({
        serverId: params.serverId,
        kind: PROFILE_PROMPT_KIND,
        payload: {
            profiles: params.profiles.map((profile) => ({
                uuid: profile.uuid,
                username: profile.username ?? null,
            })),
        },
        expiresAt,
    });
    await installProgressRepository.update(params.serverId, 50, 'hytale_profile_selection');

    const response = await waitForInteractionResponse(interactionId, expiresAt);
    const selectedUuid = typeof response.profileUuid === 'string' ? response.profileUuid.trim() : '';
    const selected = params.profiles.find((profile) => profile.uuid === selectedUuid);
    if (!selected) {
        await installInteractionRepository.fail(interactionId);
        throw new Error('Selected Hytale profile was not found');
    }

    await writeJsonSecret(params.paths.profilePath, selected);
    await installInteractionRepository.complete(interactionId);
    return selected;
}

async function getPreparedVersion(paths: HytalePaths): Promise<string> {
    const state = await readJsonIfExists<{ version?: string }>(paths.installStatePath);
    if (typeof state?.version === 'string' && state.version.trim()) return state.version.trim();
    return 'unknown';
}

async function writeCredentialStore(params: {
    paths: HytalePaths;
    oauth: OAuthTokens;
    profile: HytaleProfile;
    ownership: ServerMountOwnership;
}): Promise<void> {
    await writeJsonSecret(params.paths.credentialStorePath, {
        accessToken: params.oauth.access_token,
        refreshToken: params.oauth.refresh_token,
        accessTokenExpiresAt: params.oauth.access_expires_at,
        profileUuid: params.profile.uuid,
    });
    await chownRecursive(path.dirname(params.paths.credentialStorePath), params.ownership);
    await chownRecursive(params.paths.credentialStorePath, params.ownership);
}

function isNotFoundError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

async function readHytaleServerConfig(configPath: string): Promise<Record<string, unknown>> {
    let raw: string;
    try {
        raw = await fs.readFile(configPath, 'utf8');
    } catch (error) {
        if (isNotFoundError(error)) return {};
        throw error;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('Hytale config.json contains invalid JSON');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Hytale config.json must contain a JSON object');
    }

    return parsed as Record<string, unknown>;
}

async function configureCredentialStore(paths: HytalePaths, ownership: ServerMountOwnership): Promise<void> {
    const configDir = path.dirname(paths.serverConfigPath);
    const document = await readHytaleServerConfig(paths.serverConfigPath);
    document.AuthCredentialStore = {
        Type: 'GamePanel',
        Path: '/data/.gamepanel/hytale-credential-store.json',
    };

    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(paths.serverConfigPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await chownRecursive(configDir, ownership);
}

export async function prepareHytaleServerAuth(params: {
    serverId: number;
    metadata: OvhcloudHytaleMetadata;
    ownership: ServerMountOwnership;
}): Promise<void> {
    const paths = hytalePaths(params.serverId, params.metadata.patchline);
    await installProgressRepository.update(params.serverId, 40, 'hytale_account_auth');
    const oauth = await getProviderOAuthTokens(params.serverId, paths);
    const profiles = await getProfiles(oauth.access_token);
    const profile = await selectProfile({
        serverId: params.serverId,
        paths,
        metadata: params.metadata,
        profiles,
    });

    await installProgressRepository.update(params.serverId, 60, 'configuring_hytale_auth');
    await writeCredentialStore({
        paths,
        oauth,
        profile,
        ownership: params.ownership,
    });
    await configureCredentialStore(paths, params.ownership);
}

export async function buildHytaleContainerEnv(params: {
    serverId: number;
    baseEnv: string[];
    metadata: OvhcloudHytaleMetadata;
    version?: string;
}): Promise<string[]> {
    const paths = hytalePaths(params.serverId, params.metadata.patchline);
    const version = params.version ?? await getPreparedVersion(paths);
    return [
        ...params.baseEnv,
        `HYTALE_VERSION=${version}`,
    ];
}
