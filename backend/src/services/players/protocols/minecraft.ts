import net from 'node:net';
import { PLAYERS_QUERY_TIMEOUT_MS, type PlayersQueryTarget, type PlayersSample } from '../types.js';
import { BufferReader } from './reader.js';
import { withUdpSession } from './udp.js';

const QUERY_TIMEOUT_MS = 700;

const SESSION_ID = 1;

function writeVarInt(value: number): Buffer {
    const bytes: number[] = [];
    let remaining = value | 0;

    for (;;) {
        const byte = remaining & 0x7f;
        remaining >>>= 7;

        if (remaining === 0) {
            bytes.push(byte);
            break;
        }

        bytes.push(byte | 0x80);
    }

    return Buffer.from(bytes);
}

function tryReadVarInt(buffer: Buffer, offset: number): { value: number; size: number } | null {
    let value = 0;
    let shift = 0;
    let size = 0;

    for (;;) {
        if (offset + size >= buffer.length) return null;

        const byte = buffer.readUInt8(offset + size);
        size += 1;
        value |= (byte & 0x7f) << shift;

        if ((byte & 0x80) === 0) return { value, size };

        shift += 7;
        if (shift > 35) throw new Error('VarInt is too large');
    }
}

function framePacket(payload: Buffer): Buffer {
    return Buffer.concat([writeVarInt(payload.length), payload]);
}

function buildHandshake(target: PlayersQueryTarget): Buffer {
    const host = Buffer.from(target.host, 'utf8');
    const port = Buffer.alloc(2);
    port.writeUInt16BE(target.port, 0);

    return framePacket(Buffer.concat([
        writeVarInt(0x00), // handshake
        writeVarInt(-1), // protocol version: informational for a status ping
        writeVarInt(host.length),
        host,
        port,
        writeVarInt(1), // next state: status
    ]));
}

function parseStatusJson(json: string): PlayersSample {
    const parsed = JSON.parse(json) as {
        players?: { online?: unknown; max?: unknown; sample?: unknown };
    };

    const players = parsed.players;
    const online = typeof players?.online === 'number' ? players.online : null;
    const max = typeof players?.max === 'number' ? players.max : null;

    let names: string[] | null = null;
    if (Array.isArray(players?.sample)) {
        names = players.sample
            .map((entry) => (entry as { name?: unknown })?.name)
            .filter((name): name is string => typeof name === 'string' && name.length > 0);
    }

    return { online, max, names };
}

function tryReadStringPacket(buffer: Buffer): string | null {
    const length = tryReadVarInt(buffer, 0);
    if (!length) return null;
    if (buffer.length < length.size + length.value) return null;

    const packetId = tryReadVarInt(buffer, length.size);
    if (!packetId) return null;
    if (packetId.value !== 0x00) throw new Error(`Unexpected status packet id ${packetId.value}`);

    const stringLength = tryReadVarInt(buffer, length.size + packetId.size);
    if (!stringLength) return null;

    const start = length.size + packetId.size + stringLength.size;
    if (buffer.length < start + stringLength.value) return null;

    return buffer.toString('utf8', start, start + stringLength.value);
}

export async function queryMinecraftStatus(target: PlayersQueryTarget): Promise<PlayersSample> {
    return new Promise<PlayersSample>((resolve, reject) => {
        const socket = net.createConnection({ host: target.host, port: target.port });
        let buffered = Buffer.alloc(0);
        let settled = false;

        const settle = (error: Error | null, sample?: PlayersSample): void => {
            if (settled) return;
            settled = true;

            socket.destroy();
            if (error) reject(error);
            else resolve(sample as PlayersSample);
        };

        socket.setTimeout(PLAYERS_QUERY_TIMEOUT_MS);
        socket.on('timeout', () => settle(new Error('Minecraft status ping timed out')));
        socket.on('error', (error) => settle(error));

        socket.on('connect', () => {
            socket.write(buildHandshake(target));
            socket.write(framePacket(writeVarInt(0x00))); // status request
        });

        socket.on('data', (chunk) => {
            buffered = Buffer.concat([buffered, chunk]);

            try {
                const json = tryReadStringPacket(buffered);
                if (json === null) return; // still waiting for the rest of the packet

                settle(null, parseStatusJson(json));
            } catch (error) {
                settle(error as Error);
            }
        });
    });
}

function int32BE(value: number): Buffer {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(value, 0);
    return buffer;
}

const FULL_STAT_PADDING = 11;
const PLAYER_SECTION_PADDING = 10;

export async function queryMinecraftQuery(target: PlayersQueryTarget): Promise<PlayersSample> {
    return withUdpSession(target.host, target.port, QUERY_TIMEOUT_MS, async (send) => {
        const tokenReply = await send(Buffer.concat([
            Buffer.from([0xfe, 0xfd, 0x09]),
            int32BE(SESSION_ID),
        ]));

        if (tokenReply.length < 6 || tokenReply[0] !== 0x09) {
            throw new Error('Unexpected GS4 handshake response');
        }

        const tokenEnd = tokenReply.indexOf(0, 5);
        const token = Number.parseInt(tokenReply.toString('ascii', 5, tokenEnd < 0 ? undefined : tokenEnd), 10);
        if (!Number.isFinite(token)) throw new Error('Unreadable GS4 challenge token');

        const statReply = await send(Buffer.concat([
            Buffer.from([0xfe, 0xfd, 0x00]),
            int32BE(SESSION_ID),
            int32BE(token),
            Buffer.from([0x00, 0x00, 0x00, 0x00]), // requests the full stat
        ]));

        if (statReply.length < 5 || statReply[0] !== 0x00) {
            throw new Error('Unexpected GS4 stat response');
        }

        const reader = new BufferReader(statReply);
        reader.skip(1 + 4 + FULL_STAT_PADDING);

        const values = new Map<string, string>();
        for (;;) {
            const key = reader.cstring();
            if (!key) break;
            values.set(key, reader.cstring());
        }

        reader.skip(PLAYER_SECTION_PADDING);

        const names: string[] = [];
        for (;;) {
            const name = reader.cstring();
            if (!name) break;
            names.push(name);
        }

        const online = Number.parseInt(values.get('numplayers') ?? '', 10);
        const max = Number.parseInt(values.get('maxplayers') ?? '', 10);

        return {
            online: Number.isFinite(online) ? online : null,
            max: Number.isFinite(max) ? max : null,
            names,
        };
    });
}

export async function queryMinecraftJava(target: PlayersQueryTarget): Promise<PlayersSample> {
    const [query, status] = await Promise.allSettled([
        queryMinecraftQuery(target),
        queryMinecraftStatus(target),
    ]);

    if (query.status === 'fulfilled') return query.value;
    if (status.status === 'fulfilled') return status.value;

    throw status.reason instanceof Error ? status.reason : new Error('Minecraft query failed');
}
