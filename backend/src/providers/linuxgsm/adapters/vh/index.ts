import { applyLinuxGsmConfigPatches } from '../linuxGsmConfig.js';
import { runGenericBeforeContainerCreate } from '../generic/index.js';
import { generateStrongPassword } from '../password.js';
import type {
    AfterContainerStartContext,
    BeforeContainerCreateContext,
    GameAdapter,
} from '../types.js';

const VALHEIM_SERVER_PASSWORD_LENGTH = 20;

export const vhAdapter: GameAdapter = {
    async beforeContainerCreate(ctx: BeforeContainerCreateContext): Promise<void> {
        await runGenericBeforeContainerCreate(ctx);

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
    async afterContainerStart(_ctx: AfterContainerStartContext): Promise<void> {
        return;
    },
};
