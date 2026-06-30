import { getOvhcloudCounterStrike2Metadata } from '../../../serverMetadata.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { GameServerRow } from '../../../../types/gameServer.js';
import * as dockerUtils from '../../../../utils/docker.js';
import { ensureServerMountDirs } from '../../../../utils/storage.js';
import type { NormalizedMount } from '../../../../utils/mounts.js';
import { getServerFsRoot } from '../../../../services/fileExplorer.js';
import { assertCanModifyFrameworks } from '../../../../services/serverActionPolicy.js';
import { getRuntimeOwnership, hasStoredMount, parseStoredMounts } from '../../../runtimeConfig.js';

type GameServerWithContainer = GameServerRow & {
    docker_container_id: string;
};

export type CounterStrike2FrameworkStatus = {
    metamodInstalled: boolean;
    counterStrikeSharpInstalled: boolean;
    counterStrikeSharpRuntimePresent: boolean;
};

export type CounterStrike2ScriptResult = {
    ok: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
};

type CounterStrike2Script = 'install-metamod' | 'install-counterstrikesharp' | 'repair-frameworks';

type ScriptOptions = {
    version?: string | null;
    releaseFlavor?: 'with-runtime' | 'normal' | 'auto' | null;
    gameinfoMode?: 'ensure' | 'check' | 'skip' | null;
};

function hasDataMount(mounts: NormalizedMount[]): boolean {
    return hasStoredMount(mounts, 'data', '/data');
}

function assertCounterStrike2Server(server: GameServerRow): void {
    getOvhcloudCounterStrike2Metadata(server);
}

function assertDataMount(server: GameServerRow): NormalizedMount[] {
    const mounts = parseStoredMounts(server);
    if (!hasDataMount(mounts)) {
        throw Object.assign(new Error('OVHcloud Counter-Strike 2 requires data -> /data mount'), { statusCode: 409 });
    }

    return mounts;
}

function normalizeOptionalArg(value: string | null | undefined, fieldName: string): string | null {
    if (value === undefined || value === null) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > 120 || /[\0\r\n]/.test(normalized)) {
        throw Object.assign(new Error(`${fieldName} is invalid`), { statusCode: 400 });
    }

    return normalized;
}

function scriptPath(script: CounterStrike2Script): string {
    switch (script) {
        case 'install-metamod':
            return '/app/install-metamod.sh';
        case 'install-counterstrikesharp':
            return '/app/install-counterstrikesharp.sh';
        case 'repair-frameworks':
            return '/app/repair-cs2-frameworks.sh';
    }
}

function buildScriptCommand(script: CounterStrike2Script, options: ScriptOptions): string[] {
    const command = [scriptPath(script)];
    const version = normalizeOptionalArg(options.version, 'version');

    if (version && script !== 'repair-frameworks') {
        command.push(version);
    }

    return command;
}

function buildScriptEnv(options: ScriptOptions): string[] {
    const env: string[] = [];

    if (options.gameinfoMode) {
        env.push(`METAMOD_GAMEINFO_MODE=${options.gameinfoMode}`);
    }

    if (options.releaseFlavor) {
        env.push(`COUNTERSTRIKESHARP_RELEASE_FLAVOR=${options.releaseFlavor}`);
    }

    return env;
}

async function runOneShot(
    server: GameServerWithContainer,
    params: {
        namePrefix: string;
        cmd: string[];
        env?: string[];
    }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const mounts = assertDataMount(server);
    const resolvedMounts = await ensureServerMountDirs(server.id, mounts, getRuntimeOwnership(server));

    return dockerUtils.runOneShotContainer({
        image: server.docker_image_digest?.trim() || server.docker_image,
        namePrefix: params.namePrefix,
        cmd: params.cmd,
        env: params.env,
        mounts: resolvedMounts,
        user: 'gameserver',
        workdir: '/app',
        labels: {
            'gamepanel.serverId': String(server.id),
            'gamepanel.job': params.namePrefix,
        },
    });
}

export async function inspectCounterStrike2Frameworks(
    server: GameServerWithContainer
): Promise<CounterStrike2FrameworkStatus> {
    assertCounterStrike2Server(server);
    assertDataMount(server);

    const { rootDir } = await getServerFsRoot({ serverId: server.id, root: 'data' });
    const csgoDir = path.join(rootDir, 'server', 'game', 'csgo');

    const [metamodInstalled, counterStrikeSharpInstalled, counterStrikeSharpRuntimePresent] = await Promise.all([
        fs.stat(path.join(csgoDir, 'addons', 'metamod', 'bin', 'linuxsteamrt64', 'metamod.2.cs2.so'))
            .then((stat) => stat.isFile())
            .catch(() => false),
        fs.stat(path.join(csgoDir, 'addons', 'counterstrikesharp', 'bin', 'linuxsteamrt64', 'counterstrikesharp.so'))
            .then((stat) => stat.isFile())
            .catch(() => false),
        fs.stat(path.join(csgoDir, 'addons', 'counterstrikesharp', 'dotnet', 'dotnet'))
            .then((stat) => stat.isFile())
            .catch(() => false),
    ]);

    return {
        metamodInstalled,
        counterStrikeSharpInstalled,
        counterStrikeSharpRuntimePresent,
    };
}

export async function runCounterStrike2FrameworkScript(
    server: GameServerWithContainer,
    script: CounterStrike2Script,
    options: ScriptOptions = {}
): Promise<CounterStrike2ScriptResult> {
    assertCounterStrike2Server(server);
    assertCanModifyFrameworks(server);
    assertDataMount(server);

    const result = await runOneShot(server, {
        namePrefix: `gamepanel-cs2-${script}-${server.id}`,
        cmd: buildScriptCommand(script, options),
        env: buildScriptEnv(options),
    });

    return {
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
    };
}
