import { execInContainer } from '../docker.js';

export async function execShellCommand(
    containerId: string,
    command: string,
    opts?: { user?: string; workdir?: string }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const cmd = ['/bin/bash', '-lc', command];

    return execInContainer(containerId, cmd, {
        user: opts?.user ?? 'linuxgsm',
        workdir: opts?.workdir ?? '/app',
    });
}
