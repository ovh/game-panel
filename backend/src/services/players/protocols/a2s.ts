import { PLAYERS_QUERY_TIMEOUT_MS, type PlayersQueryTarget, type PlayersSample } from '../types.js';
import { BufferReader } from './reader.js';
import { withUdpSession } from './udp.js';

const RESPONSE_CHALLENGE = 0x41;
const RESPONSE_INFO = 0x49;
const RESPONSE_PLAYER = 0x44;

const SIMPLE_HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const INFO_PAYLOAD = Buffer.from('Source Engine Query\0', 'ascii');

type UdpSend = (payload: Buffer) => Promise<Buffer>;

function buildInfoRequest(challenge?: Buffer): Buffer {
    const base = Buffer.concat([SIMPLE_HEADER, Buffer.from([0x54]), INFO_PAYLOAD]);
    return challenge ? Buffer.concat([base, challenge]) : base;
}

function buildPlayerRequest(challenge?: Buffer): Buffer {
    return Buffer.concat([SIMPLE_HEADER, Buffer.from([0x55]), challenge ?? SIMPLE_HEADER]);
}

function readSimpleResponse(message: Buffer): BufferReader {
    if (message.length < 5) throw new Error('A2S response is too short');
    if (message[0] === 0xfe) throw new Error('Split A2S responses are not supported');
    if (message.readUInt32LE(0) !== 0xffffffff) throw new Error('Unexpected A2S response header');

    const reader = new BufferReader(message);
    reader.skip(4);
    return reader;
}

async function exchange(
    send: UdpSend,
    build: (challenge?: Buffer) => Buffer,
    expectedType: number,
): Promise<BufferReader> {
    let reader = readSimpleResponse(await send(build()));
    let type = reader.uint8();

    if (type === RESPONSE_CHALLENGE) {
        const challenge = Buffer.alloc(4);
        challenge.writeInt32LE(reader.int32LE(), 0);

        reader = readSimpleResponse(await send(build(challenge)));
        type = reader.uint8();
    }

    if (type !== expectedType) {
        throw new Error(`Unexpected A2S response type 0x${type.toString(16)}`);
    }

    return reader;
}

function parseInfo(reader: BufferReader): { online: number; max: number } {
    reader.uint8(); // protocol version
    reader.cstring(); // server name
    reader.cstring(); // map
    reader.cstring(); // game folder
    reader.cstring(); // game name
    reader.uint16LE(); // Steam application id

    return { online: reader.uint8(), max: reader.uint8() };
}

function parsePlayerNames(reader: BufferReader): string[] {
    const count = reader.uint8();
    const names: string[] = [];

    for (let index = 0; index < count; index += 1) {
        try {
            reader.uint8(); // player index
            const name = reader.cstring();
            reader.int32LE(); // score
            reader.floatLE(); // time connected

            if (name) names.push(name);
        } catch {
            break;
        }
    }

    return names;
}

export async function queryA2S(
    target: PlayersQueryTarget,
    options: { playerList?: boolean } = {},
): Promise<PlayersSample> {
    return withUdpSession(target.host, target.port, PLAYERS_QUERY_TIMEOUT_MS, async (send) => {
        const info = parseInfo(await exchange(send, buildInfoRequest, RESPONSE_INFO));

        let names: string[] | null = null;
        if (options.playerList) {
            try {
                names = parsePlayerNames(await exchange(send, buildPlayerRequest, RESPONSE_PLAYER));
            } catch {
                names = null;
            }
        }

        return { online: info.online, max: info.max, names };
    });
}
