import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { installInteractionRepository, installProgressRepository } from '../../../../database/index.js';
import { logError } from '../../../../utils/logger.js';
import { nowIso } from '../../../../utils/time.js';
import type { ServerMountOwnership } from '../../../../utils/storage.js';
import { extractSingleZipEntry, extractZip } from '../../../../utils/zip.js';
import {
    DOWNLOADER_AUTH_TIMEOUT_MS,
    DOWNLOADER_DOWNLOAD_TIMEOUT_MS,
    DOWNLOADER_ENTRY,
    DOWNLOADER_PRINT_VERSION_TIMEOUT_MS,
    DOWNLOADER_PROMPT_KIND,
    DOWNLOADER_URL,
} from './constants.js';
import { appendCapped, runCommand } from './command.js';
import { chownRecursive, downloadFile, writeJsonSecret } from './io.js';
import { hytalePaths } from './paths.js';
import type { CommandResult, HytalePaths } from './types.js';

function createDownloaderPromptWatcher(serverId: number, purpose: 'downloader', onAuthTimeout?: () => void) {
    let output = '';
    let interactionId: number | null = null;
    let creating: Promise<void> | null = null;
    let authTimer: ReturnType<typeof setTimeout> | null = null;
    let expired = false;

    const clearAuthTimer = () => {
        if (!authTimer) return;
        clearTimeout(authTimer);
        authTimer = null;
    };

    const maybeCreate = async () => {
        if (interactionId || creating) return;

        const verificationUriComplete =
            output.match(/https:\/\/oauth\.accounts\.hytale\.com\/oauth2\/device\/verify\?user_code=[^\s]+/)?.[0]
            ?? output.match(/https:\/\/accounts\.hytale\.com\/device\?user_code=[^\s]+/)?.[0]
            ?? null;
        const verificationUri =
            output.match(/https:\/\/oauth\.accounts\.hytale\.com\/oauth2\/device\/verify(?!\?)[^\s]*/)?.[0]
            ?? output.match(/https:\/\/accounts\.hytale\.com\/device(?!\?)[^\s]*/)?.[0]
            ?? null;
        const userCode =
            output.match(/Authorization code:\s*([A-Za-z0-9_-]+)/)?.[1]
            ?? output.match(/Code:\s*([A-Za-z0-9_-]+)/)?.[1]
            ?? verificationUriComplete?.match(/[?&]user_code=([^&\s]+)/)?.[1]
            ?? null;

        if (!verificationUriComplete && !verificationUri) return;

        creating = (async () => {
            const expiresAt = new Date(Date.now() + DOWNLOADER_AUTH_TIMEOUT_MS).toISOString();
            interactionId = await installInteractionRepository.create({
                serverId,
                kind: DOWNLOADER_PROMPT_KIND,
                payload: {
                    purpose,
                    verificationUri,
                    verificationUriComplete,
                    userCode,
                },
                expiresAt,
            });
            authTimer = setTimeout(() => {
                expired = true;
                if (interactionId) {
                    installInteractionRepository.expire(interactionId).catch((error) => {
                        logError('HYTALE:DOWNLOADER_AUTH_TIMEOUT', error, { serverId });
                    });
                }
                onAuthTimeout?.();
            }, DOWNLOADER_AUTH_TIMEOUT_MS);
            await installProgressRepository.update(serverId, 10, 'hytale_downloader_auth');
        })();

        await creating;
    };

    return {
        onOutput(chunk: string) {
            output = appendCapped(output, chunk);
            void maybeCreate().catch((error) => {
                logError('HYTALE:DOWNLOADER_PROMPT', error, { serverId });
            });
        },
        async complete() {
            if (creating) await creating;
            clearAuthTimer();
            if (interactionId) await installInteractionRepository.complete(interactionId);
        },
        async fail() {
            if (creating) await creating;
            clearAuthTimer();
            if (interactionId) await installInteractionRepository.fail(interactionId);
        },
        async expire() {
            if (creating) await creating;
            expired = true;
            clearAuthTimer();
            if (interactionId) await installInteractionRepository.expire(interactionId);
        },
        wasExpired() {
            return expired;
        },
    };
}

export async function ensureDownloader(serverId: number, patchline: string): Promise<HytalePaths> {
    const paths = hytalePaths(serverId, patchline);
    await fs.mkdir(paths.stateDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(paths.downloaderDir, { recursive: true, mode: 0o700 });

    if (!existsSync(paths.downloaderZip)) {
        await downloadFile(DOWNLOADER_URL, paths.downloaderZip);
    }

    if (!existsSync(paths.downloaderBin)) {
        const extracted = await extractSingleZipEntry(paths.downloaderZip, DOWNLOADER_ENTRY, paths.downloaderDir);
        await fs.chmod(extracted, 0o700);
    }

    return paths;
}

function downloaderArgs(paths: HytalePaths, patchline: string, extraArgs: string[]): string[] {
    return [
        '-credentials-path',
        paths.downloaderCredentialsPath,
        '-skip-update-check',
        '-patchline',
        patchline,
        ...extraArgs,
    ];
}

function isHytaleVersionLine(line: string): boolean {
    const semverLike = /^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;
    const legacyDateHash = /^\d{4}\.\d{2}\.\d{2}-[A-Za-z0-9]+$/;
    return semverLike.test(line) || legacyDateHash.test(line);
}

function parseHytaleVersion(output: string): string {
    const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines.reverse()) {
        if (isHytaleVersionLine(line)) return line;
    }
    throw new Error('Could not parse Hytale version from downloader output');
}

async function runDownloaderCommand(params: {
    serverId: number;
    paths: HytalePaths;
    patchline: string;
    args: string[];
    timeoutMs: number;
}): Promise<CommandResult> {
    let killProcess: (() => void) | null = null;
    const prompt = createDownloaderPromptWatcher(params.serverId, 'downloader', () => {
        killProcess?.();
    });
    const result = await runCommand(params.paths.downloaderBin, downloaderArgs(params.paths, params.patchline, params.args), {
        cwd: params.paths.stateDir,
        onOutput: prompt.onOutput,
        timeoutMs: params.timeoutMs,
        onTimeout: () => prompt.expire(),
        onSpawn: (kill) => {
            killProcess = kill;
        },
    });

    if (result.exitCode === 0) {
        await prompt.complete();
        return result;
    }

    if (result.timedOut) {
        await prompt.expire();
        throw new Error(`Hytale downloader timed out after ${Math.round(params.timeoutMs / 1000)} seconds`);
    }

    if (prompt.wasExpired()) {
        throw new Error('Hytale downloader authorization expired before completion');
    }

    await prompt.fail();
    throw new Error(`Hytale downloader failed with code ${result.exitCode}: ${result.stderr || result.stdout}`);
}

export async function getAvailableHytaleVersion(params: {
    serverId: number;
    paths: HytalePaths;
    patchline: string;
}): Promise<string> {
    const result = await runDownloaderCommand({
        serverId: params.serverId,
        paths: params.paths,
        patchline: params.patchline,
        args: ['-print-version'],
        timeoutMs: DOWNLOADER_PRINT_VERSION_TIMEOUT_MS,
    });

    return parseHytaleVersion(result.stdout);
}

export async function prepareGameFiles(params: {
    serverId: number;
    paths: HytalePaths;
    patchline: string;
    version: string;
    ownership: ServerMountOwnership;
}): Promise<void> {
    const startScript = path.join(params.paths.gameDir, 'start.sh');
    if (existsSync(startScript)) {
        await fs.chmod(startScript, 0o755).catch(() => undefined);
        await chownRecursive(params.paths.dataDir, params.ownership);
        await writeJsonSecret(params.paths.installStatePath, {
            patchline: params.patchline,
            version: params.version,
            updatedAt: nowIso(),
        });
        return;
    }

    if (existsSync(params.paths.gameDir)) {
        throw new Error(`Hytale game directory exists but ${startScript} is missing`);
    }

    await installProgressRepository.update(params.serverId, 20, 'downloading_server_files');
    const downloadArchivePath = path.join(params.paths.stateDir, `hytale-${params.patchline}.zip`);
    await runDownloaderCommand({
        serverId: params.serverId,
        paths: params.paths,
        patchline: params.patchline,
        args: ['-download-path', downloadArchivePath],
        timeoutMs: DOWNLOADER_DOWNLOAD_TIMEOUT_MS,
    });

    await installProgressRepository.update(params.serverId, 30, 'extracting_server_files');
    const stagingDir = path.join(params.paths.dataDir, `.game-staging-${Date.now()}`);
    await fs.rm(stagingDir, { recursive: true, force: true });
    await fs.mkdir(stagingDir, { recursive: true });
    await extractZip(downloadArchivePath, stagingDir);

    const stagedStartScript = path.join(stagingDir, 'start.sh');
    if (!existsSync(stagedStartScript)) {
        await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
        throw new Error('Downloaded Hytale archive did not contain start.sh at its root');
    }

    await fs.rename(stagingDir, params.paths.gameDir);
    await fs.chmod(startScript, 0o755).catch(() => undefined);
    await chownRecursive(params.paths.dataDir, params.ownership);
    await writeJsonSecret(params.paths.installStatePath, {
        patchline: params.patchline,
        version: params.version,
        updatedAt: nowIso(),
    });
}
