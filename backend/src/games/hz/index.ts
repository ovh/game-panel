import { applyLinuxGsmConfigPatches } from '../lgsmConfig.js';
import { runGenericPreInstall } from '../generic/index.js';
import type { GameAdapter, InstallPrepareContext, InstallReadyContext } from '../types.js';

export const hzAdapter: GameAdapter = {
    async preInstall(ctx: InstallPrepareContext): Promise<void> {
        await runGenericPreInstall(ctx);

        await applyLinuxGsmConfigPatches(
            { dataDir: ctx.dataDir, gameServerName: ctx.gameServerName },
            [
                {
                    fileName: 'common.cfg',
                    values: {
                        systemdir: '${serverfiles}/HumanitZServer',
                        executabledir: '${systemdir}/Binaries/Linux',
                        executable: './HumanitZServer-Linux-Shipping',
                        servercfgdir: '${systemdir}',
                        servercfg: 'GameServerSettings.ini',
                        servercfgdefault: 'GameUserSettings.ini',
                        servercfgfullpath: '${servercfgdir}/${servercfg}',
                    },
                },
            ]
        );
    },
    async postInstall(_ctx: InstallReadyContext): Promise<void> {
        return;
    },
};
