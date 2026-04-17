export type SteamCredentials = {
    username: string;
    password: string;
};

export type InstallPrepareContext = {
    serverId: number;
    gameKey: string;
    gameServerName: string;
    dataDir: string;
    steamCredentials: SteamCredentials | null;
};

export type InstallReadyContext = {
    serverId: number;
    gameKey: string;
    containerId: string;
};

export interface GameAdapter {
    preInstall(ctx: InstallPrepareContext): Promise<void>;
    postInstall(ctx: InstallReadyContext): Promise<void>;
}
