export type HytaleProfile = {
    uuid: string;
    username?: string | null;
};

export type OAuthTokens = {
    access_token: string;
    refresh_token: string;
    token_type?: string;
    scope?: string;
    access_expires_at: string;
    updated_at: string;
};

export type HytalePaths = {
    serverRoot: string;
    dataDir: string;
    gameDir: string;
    stateDir: string;
    downloaderDir: string;
    downloaderZip: string;
    downloaderBin: string;
    downloaderCredentialsPath: string;
    providerOauthPath: string;
    profilePath: string;
    installStatePath: string;
    credentialStorePath: string;
    serverConfigPath: string;
};

export type CommandResult = {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut?: boolean;
};

export type RestoreResult = {
    ok: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    restarted: boolean;
};
