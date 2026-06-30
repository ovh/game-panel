export const PERMISSIONS = {
    users: {
        manage: 'users.manage',
    },
    server: {
        install: 'server.install',
        edit: 'server.edit',
        power: 'server.power',
        delete: 'server.delete',
        commandSend: 'server.command.send',
        env: 'server.env',
    },
    scheduledTasks: {
        read: 'scheduledtasks.read',
        write: 'scheduledtasks.write',
    },
    container: {
        terminal: 'container.terminal',
        logsRead: 'container.logs.read',
    },
    fs: {
        read: 'fs.read',
        write: 'fs.write',
    },
    backups: {
        read: 'backups.read',
        create: 'backups.create',
        delete: 'backups.delete',
        download: 'backups.download',
        rename: 'backups.rename',
        restore: 'backups.restore',
        settingsWrite: 'backups.settings.write',
    },
    minecraft: {
        settings: {
            read: 'minecraft.settings.read',
            write: 'minecraft.settings.write',
        },
        addons: {
            read: 'minecraft.addons.read',
            write: 'minecraft.addons.write',
        },
        operators: {
            read: 'minecraft.operators.read',
            write: 'minecraft.operators.write',
        },
        whitelist: {
            read: 'minecraft.whitelist.read',
            write: 'minecraft.whitelist.write',
        },
        bans: {
            read: 'minecraft.bans.read',
            write: 'minecraft.bans.write',
        },
        ipBans: {
            read: 'minecraft.ip-bans.read',
            write: 'minecraft.ip-bans.write',
        },
    },
    hytale: {
        settings: {
            read: 'hytale.settings.read',
            write: 'hytale.settings.write',
        },
        mods: {
            read: 'hytale.mods.read',
            write: 'hytale.mods.write',
        },
    },
    counterStrike2: {
        frameworksWrite: 'cs2.frameworks.write',
    },
} as const;

function collectPermissionStrings(node: unknown, acc: Set<string>): void {
    if (typeof node === 'string') {
        acc.add(node);
        return;
    }
    if (node && typeof node === 'object') {
        for (const value of Object.values(node)) {
            collectPermissionStrings(value, acc);
        }
    }
}

export const ALL_PERMISSIONS: ReadonlySet<string> = (() => {
    const acc = new Set<string>();
    collectPermissionStrings(PERMISSIONS, acc);
    return acc;
})();

export const GLOBAL_ONLY_PERMISSIONS: ReadonlySet<string> = new Set<string>([
    PERMISSIONS.users.manage,
    PERMISSIONS.server.install,
]);

export const ASSIGNABLE_SERVER_PERMISSIONS: ReadonlySet<string> = new Set<string>(
    [...ALL_PERMISSIONS].filter((perm) => !GLOBAL_ONLY_PERMISSIONS.has(perm)),
);
