import dgram from 'node:dgram';

type UdpSend = (payload: Buffer) => Promise<Buffer>;

export async function withUdpSession<T>(
    host: string,
    port: number,
    timeoutMs: number,
    run: (send: UdpSend) => Promise<T>,
): Promise<T> {
    const socket = dgram.createSocket('udp4');

    let pending: {
        resolve: (message: Buffer) => void;
        reject: (error: Error) => void;
        timer: NodeJS.Timeout;
    } | null = null;

    const settle = (error: Error | null, message?: Buffer): void => {
        if (!pending) return;

        clearTimeout(pending.timer);
        const { resolve, reject } = pending;
        pending = null;

        if (error) reject(error);
        else resolve(message as Buffer);
    };

    socket.on('message', (message) => settle(null, message));
    socket.on('error', (error) => settle(error));

    const send: UdpSend = (payload) =>
        new Promise<Buffer>((resolve, reject) => {
            if (pending) {
                reject(new Error('A UDP exchange is already in flight'));
                return;
            }

            pending = {
                resolve,
                reject,
                timer: setTimeout(() => settle(new Error('UDP query timed out')), timeoutMs),
            };

            socket.send(payload, port, host, (error) => {
                if (error) settle(error);
            });
        });

    try {
        return await run(send);
    } finally {
        settle(new Error('UDP session closed'));
        try {
            socket.close();
        } catch {
            // Already closed.
        }
    }
}
