function mustEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

function envOrDefault(name: string, fallback: string): string {
    const v = process.env[name];
    if (!v || !v.trim()) return fallback;
    return v.trim();
}

function boolEnv(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (!raw || !raw.trim()) return fallback;

    switch (raw.trim().toLowerCase()) {
        case '1':
        case 'true':
        case 'yes':
        case 'on':
            return true;
        case '0':
        case 'false':
        case 'no':
        case 'off':
            return false;
        default:
            return fallback;
    }
}

type TrustProxySetting = boolean | number | string;

function trustProxyEnv(name: string, fallback: TrustProxySetting): TrustProxySetting {
    const raw = process.env[name];
    if (!raw || !raw.trim()) return fallback;

    const normalized = raw.trim().toLowerCase();

    switch (normalized) {
        case '1':
            return 1;
        case 'true':
        case 'yes':
        case 'on':
            return true;
        case '0':
        case 'false':
        case 'no':
        case 'off':
            return false;
        default:
            if (/^\d+$/.test(raw.trim())) return Number(raw.trim());
            return raw.trim();
    }
}

type AppConfig = {
    port: number;
    jwtSecret: string;
    frontendUrl: string;
    trustProxy: TrustProxySetting;
    adminUsername: string;
    adminPassword: string;
    gamepanelServersDir: string;
    gamepanelDataDir: string;
    dockerSocket: string;
    appUser: string;
    hostAgentSocket: string;
    instanceId: string | null;
    instanceSecret: string | null;
    telemetryEnabled: boolean;
    telemetryApiBaseUrl: string | null;
};

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
    if (cached) return cached;

    cached = {
        port: Number(mustEnv('PORT')),
        jwtSecret: mustEnv('JWT_SECRET'),
        frontendUrl: mustEnv('FRONTEND_URL'),
        trustProxy: trustProxyEnv('TRUST_PROXY', false),
        adminUsername: envOrDefault('ADMIN_USERNAME', 'admin'),
        adminPassword: mustEnv('ADMIN_PASSWORD'),
        gamepanelServersDir: envOrDefault('GAMEPANEL_SERVERS_DIR', '/opt/gamepanel/servers'),
        gamepanelDataDir: envOrDefault('GAMEPANEL_DB_DIR', '/opt/gamepanel/data'),
        dockerSocket: envOrDefault('DOCKER_SOCKET', '/var/run/docker.sock'),
        appUser: envOrDefault('APP_USER', 'debian'),
        hostAgentSocket: envOrDefault('HOST_AGENT_SOCKET', '/run/gamepanel/host-agent.sock'),
        instanceId: process.env.APP_INSTANCE_ID?.trim() || null,
        instanceSecret: process.env.APP_INSTANCE_SECRET?.trim() || null,
        telemetryEnabled: boolEnv('TELEMETRY_ENABLED', true),
        telemetryApiBaseUrl: process.env.TELEMETRY_API_BASE_URL?.trim() || null,
    };

    return cached;
}
