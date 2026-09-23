import type { ConfigFileDescriptor } from '../../settings/types.js';

export function garrysModConfigFiles(): ConfigFileDescriptor[] {
    return [
        { path: '/server/garrysmod/cfg/server.cfg', format: 'cfg', label: 'Server convars (server.cfg)' },
        { path: '/server/garrysmod/cfg/mount.cfg', format: 'cfg', label: 'Mounted content (mount.cfg)' },
        { path: '/server/garrysmod/cfg/mapcycle.txt', format: 'txt', label: 'Map cycle (mapcycle.txt)' },
    ];
}
