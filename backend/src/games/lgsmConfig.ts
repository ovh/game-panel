import fs from 'node:fs/promises';
import path from 'node:path';
import type { InstallPrepareContext } from './types.js';

export type LinuxGsmConfigPatch = {
    fileName: string;
    values: Record<string, string>;
};

type LinuxGsmPatchContext = {
    dataDir: string;
    gameServerName: string;
};

function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toLinuxGsmValue(raw: string): string {
    return String(raw ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function toLinuxGsmAssignment(key: string, value: string): string {
    return `${key}="${toLinuxGsmValue(value)}"`;
}

function upsertLinuxGsmAssignments(content: string, values: Record<string, string>): string {
    const lines = content.length > 0 ? content.split(/\r?\n/) : [];
    const entries = Object.entries(values);

    for (const [key, value] of entries) {
        const assignment = toLinuxGsmAssignment(key, value);
        const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
        const existingIndex = lines.findIndex((line) => keyPattern.test(line));

        if (existingIndex >= 0) {
            lines[existingIndex] = assignment;
        } else {
            lines.push(assignment);
        }
    }

    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }

    const next = lines.join('\n');
    return next.length > 0 ? `${next}\n` : '';
}

function resolveGameConfigDir(ctx: LinuxGsmPatchContext): string {
    const configRoot = path.resolve(path.join(ctx.dataDir, 'config-lgsm'));
    const safeName = path.basename(ctx.gameServerName);

    if (!safeName || safeName !== ctx.gameServerName) {
        throw new Error(`Invalid gameServerName for config patching: ${ctx.gameServerName}`);
    }

    return path.resolve(path.join(configRoot, safeName));
}

async function readTextIfExists(filePath: string): Promise<string> {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
        if (error?.code === 'ENOENT') return '';
        throw error;
    }
}

export async function applyLinuxGsmConfigPatches(
    ctx: LinuxGsmPatchContext,
    patches: LinuxGsmConfigPatch[]
): Promise<void> {
    if (!Array.isArray(patches) || patches.length === 0) return;

    const gameConfigDir = resolveGameConfigDir(ctx);
    await fs.mkdir(gameConfigDir, { recursive: true });

    for (const patch of patches) {
        if (!patch || typeof patch.fileName !== 'string' || patch.fileName.trim() === '') {
            continue;
        }

        const fileName = path.basename(patch.fileName.trim());
        const values = patch.values ?? {};
        const hasValues = Object.keys(values).length > 0;
        if (!hasValues) continue;

        const targetFile = path.join(gameConfigDir, fileName);
        const current = await readTextIfExists(targetFile);
        const next = upsertLinuxGsmAssignments(current, values);
        await fs.writeFile(targetFile, next, 'utf-8');
    }
}

export async function applyBasePreInstallConfig(ctx: InstallPrepareContext): Promise<void> {
    if (!ctx.steamCredentials) return;

    await applyLinuxGsmConfigPatches(
        { dataDir: ctx.dataDir, gameServerName: ctx.gameServerName },
        [
            {
                fileName: 'secrets-common.cfg',
                values: {
                    steamuser: ctx.steamCredentials.username,
                    steampass: ctx.steamCredentials.password,
                },
            },
        ]
    );
}
