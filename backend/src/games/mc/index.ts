import { runGenericPreInstall } from '../generic/index.js';
import { execShellCommand } from '../../utils/docker.js';
import type { GameAdapter, InstallPrepareContext, InstallReadyContext } from '../types.js';

const INSTALL_MINECRAFT_JAVA_25 = `
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y openjdk-25-jre-headless
`.trim();

export const mcAdapter: GameAdapter = {
    async preInstall(ctx: InstallPrepareContext): Promise<void> {
        await runGenericPreInstall(ctx);
    },
    async postInstall(ctx: InstallReadyContext): Promise<void> {
        // Temporary LinuxGSM workaround until the upstream dependency map installs Java 25 for mc.
        const { exitCode, stdout, stderr } = await execShellCommand(ctx.containerId, INSTALL_MINECRAFT_JAVA_25, {
            user: 'root',
            workdir: '/',
        });

        if (exitCode !== 0) {
            throw new Error(`Failed to install Java 25 for Minecraft: ${stderr || stdout}`);
        }
    },
};
