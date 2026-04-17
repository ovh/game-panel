import { applyLinuxGsmConfigPatches } from '../lgsmConfig.js';
import { runGenericPreInstall } from '../generic/index.js';
import { generateStrongPassword } from '../password.js';
import type { GameAdapter, InstallPrepareContext, InstallReadyContext } from '../types.js';

const VALHEIM_SERVER_PASSWORD_LENGTH = 20;

export const vhAdapter: GameAdapter = {
    async preInstall(ctx: InstallPrepareContext): Promise<void> {
        await runGenericPreInstall(ctx);

        const serverPassword = generateStrongPassword(VALHEIM_SERVER_PASSWORD_LENGTH);
        await applyLinuxGsmConfigPatches(
            { dataDir: ctx.dataDir, gameServerName: ctx.gameServerName },
            [
                {
                    fileName: 'secrets-common.cfg',
                    values: {
                        serverpassword: serverPassword,
                    },
                },
            ]
        );
    },
    async postInstall(_ctx: InstallReadyContext): Promise<void> {
        return;
    },
};
