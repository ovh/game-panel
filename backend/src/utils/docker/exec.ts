import { PassThrough } from 'stream';
import { docker } from './client.js';

/**
 * Executes a command inside a container and returns exit code + stdout/stderr.
 */
export async function execInContainer(
    containerId: string,
    cmd: string[],
    opts?: { workdir?: string; user?: string }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const container = docker.getContainer(containerId);

    const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: opts?.workdir,
        User: opts?.user,
    });

    const stream = (await exec.start({ hijack: true, stdin: false })) as unknown as NodeJS.ReadableStream;

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const stdout = new PassThrough();
    const stderr = new PassThrough();

    (docker as any).modem.demuxStream(stream, stdout, stderr);

    stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
    stderr.on('data', (c: Buffer) => stderrChunks.push(c));

    await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
    });

    const inspect = await exec.inspect();

    return {
        exitCode: inspect.ExitCode ?? -1,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
    };
}
