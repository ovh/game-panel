import type { Router } from 'express';
import type { ProviderInstallContext } from '../../installTypes.js';
import type { ResolvedInstallSpec } from '../../installTypes.js';
import type { HealthStatus } from '../../../types/gameServer.js';
import type { NormalizedHealthcheck } from '../../../utils/healthcheck.js';
import type { NormalizedMount } from '../../../utils/mounts.js';
import type { NormalizedPorts } from '../../../utils/ports.js';
import type { NormalizedResourceLimits } from '../../../utils/resourceLimits.js';
import type { GameServerRow } from '../../../types/gameServer.js';
import type { InstallStep } from '../../../services/installPlan.js';
import type { PlayersQueryTarget, PlayersSample } from '../../../services/players/types.js';
import type { OvhcloudSettingsSupport } from '../settings/types.js';
import type { FsEntry } from '../../../utils/fsBrowser.js';

export type OvhcloudBackupLocation = {
    root: string;
    basePath: string;
    containerPrefix: string;
};

export type OvhcloudBackupCreateResult = {
    ok: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    mode?: string;
};

export type OvhcloudBackupRestoreResult = {
    ok: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    restarted: boolean;
};

export type OvhcloudBackupRestoreInput = {
    apiPath: string;
    resolvedApiPath: string;
    location: OvhcloudBackupLocation;
};

export type OvhcloudBackupFilePair = {
    listBackups(entries: FsEntry[]): FsEntry[];
    membersOf(name: string): string[];
};

export type OvhcloudBackupDirectory = {
    isBackup(name: string): boolean;
};

export type OvhcloudBackupSupport = {
    kind?: 'archive' | 'directory' | 'file-pair';
    extensions: string[];
    location: OvhcloudBackupLocation;
    resolveLocation?(server: GameServerRow): Promise<OvhcloudBackupLocation>;
    filePair?: OvhcloudBackupFilePair;
    directory?: OvhcloudBackupDirectory;
    create?(server: GameServerRow & { docker_container_id: string }, options?: Record<string, unknown>): Promise<OvhcloudBackupCreateResult>;
    createUnsupportedMessage?: string;
    restore?(server: GameServerRow & { docker_container_id: string }, input: OvhcloudBackupRestoreInput): Promise<OvhcloudBackupRestoreResult>;
};

export type OvhcloudInstallInput = {
    serverId: number;
    containerName: string;
    spec: ResolvedInstallSpec;
    username?: string;
    skipTelemetry?: boolean;
};

export type OvhcloudRecreateInput = {
    serverId: number;
    start: boolean;
    containerName?: string;
    image?: string;
    env?: string[];
    mounts?: NormalizedMount[];
    ports?: NormalizedPorts;
    healthcheck?: NormalizedHealthcheck | null;
    resourceLimits?: NormalizedResourceLimits;
};

export type OvhcloudLifecycleSupport = {
    restartPolicy?: 'no' | 'unless-stopped';
    stopTimeoutSeconds?: number;
    install?(input: OvhcloudInstallInput): Promise<void>;
    cleanupFailedInstall?(serverId: number, spec: ResolvedInstallSpec): Promise<void>;
    start?(serverId: number, server: GameServerRow): Promise<void>;
    restart?(serverId: number, server: GameServerRow): Promise<void>;
    afterStopped?(serverId: number, server: GameServerRow): Promise<void>;
    beforeDelete?(serverId: number, server: GameServerRow): Promise<void>;
    recreate?(server: GameServerRow, input: OvhcloudRecreateInput): Promise<{ containerId: string; healthStatus: HealthStatus }>;
};

export type OvhcloudConsoleSupport = {
    script: string;
    user?: string;
    workdir?: string;
};

export type OvhcloudPlayersSupport = {
    minIntervalMs?: number;
    resolvePort(server: GameServerRow): number | null;
    query(server: GameServerRow, target: PlayersQueryTarget): Promise<PlayersSample>;
    sanitize?(server: GameServerRow, sample: PlayersSample): PlayersSample | null;
};

export type OvhcloudWipeSupport = {
    soft?(server: GameServerRow): Promise<string[]> | string[];
    hard?: boolean;
};

export type OvhcloudFeatureRoute = {
    path: string;
    router: Router;
};

export type OvhcloudInstallResolution = {
    mounts: NormalizedMount[];
    env: string[];
    providerMetadata: Record<string, unknown>;
};

export type OvhcloudImageAdapter = {
    key: string;
    supportsImageId(imageId: string): boolean;
    supportsServer(server: GameServerRow): boolean;
    resolveInstall(ctx: ProviderInstallContext, imageId: string): OvhcloudInstallResolution;
    validateEnv?(server: GameServerRow, env: string[]): string[];
    backup?: OvhcloudBackupSupport;
    lifecycle?: OvhcloudLifecycleSupport;
    console?: OvhcloudConsoleSupport | ((server: GameServerRow) => OvhcloudConsoleSupport | undefined);
    wipe?: OvhcloudWipeSupport;
    players?: OvhcloudPlayersSupport;
    settings?: OvhcloudSettingsSupport;
    installSteps?: InstallStep[];
    routes?: OvhcloudFeatureRoute[];
};
