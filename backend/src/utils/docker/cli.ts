import { execInContainer } from './exec.js';

export async function execShellCommand(
    containerId: string,
    command: string,
    opts?: { user?: string; workdir?: string; env?: string[] }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const cmd = ['/bin/bash', '-lc', command];

    return execInContainer(containerId, cmd, {
        user: opts?.user,
        workdir: opts?.workdir,
        env: opts?.env,
    });
}
