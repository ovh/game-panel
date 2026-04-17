import { applyBasePreInstallConfig } from '../lgsmConfig.js';
import type { GameAdapter, InstallPrepareContext, InstallReadyContext } from '../types.js';

export async function runGenericPreInstall(ctx: InstallPrepareContext): Promise<void> {
    await applyBasePreInstallConfig(ctx);
}

export const genericAdapter: GameAdapter = {
    async preInstall(ctx: InstallPrepareContext): Promise<void> {
        await runGenericPreInstall(ctx);
    },
    async postInstall(_ctx: InstallReadyContext): Promise<void> {
        return;
    },
};
