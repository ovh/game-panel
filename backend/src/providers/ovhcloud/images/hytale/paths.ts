import path from 'node:path';
import { getServerStoragePaths } from '../../../../utils/storage.js';
import { DOWNLOADER_ENTRY } from './constants.js';
import type { HytalePaths } from './types.js';

export function hytalePaths(serverId: number, _patchline = 'release'): HytalePaths {
    const storage = getServerStoragePaths(serverId);
    const stateDir = path.join(storage.serverRoot, '.state', 'hytale');
    const downloaderDir = path.join(stateDir, 'downloader');

    return {
        serverRoot: storage.serverRoot,
        dataDir: path.join(storage.serverRoot, 'data'),
        gameDir: path.join(storage.serverRoot, 'data', 'game'),
        stateDir,
        downloaderDir,
        downloaderZip: path.join(stateDir, 'hytale-downloader.zip'),
        downloaderBin: path.join(downloaderDir, DOWNLOADER_ENTRY),
        downloaderCredentialsPath: path.join(stateDir, 'hytale-downloader-credentials.json'),
        providerOauthPath: path.join(stateDir, 'provider-oauth.json'),
        profilePath: path.join(stateDir, 'profile.json'),
        installStatePath: path.join(stateDir, 'install-state.json'),
        credentialStorePath: path.join(storage.serverRoot, 'data', '.gamepanel', 'hytale-credential-store.json'),
        serverConfigPath: path.join(storage.serverRoot, 'data', 'game', 'Server', 'config.json'),
    };
}
