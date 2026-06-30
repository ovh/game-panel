import { applyBasePreInstallConfig } from '../linuxGsmConfig.js';
import type {
    AfterContainerStartContext,
    BeforeContainerCreateContext,
    GameAdapter,
} from '../types.js';

export async function runGenericBeforeContainerCreate(ctx: BeforeContainerCreateContext): Promise<void> {
    await applyBasePreInstallConfig(ctx);
}

export const genericAdapter: GameAdapter = {
    async beforeContainerCreate(ctx: BeforeContainerCreateContext): Promise<void> {
        await runGenericBeforeContainerCreate(ctx);
    },
    async afterContainerStart(_ctx: AfterContainerStartContext): Promise<void> {
        return;
    },
};
