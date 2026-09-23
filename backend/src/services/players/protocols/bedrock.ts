import { PLAYERS_QUERY_TIMEOUT_MS, type PlayersQueryTarget, type PlayersSample } from '../types.js';
import { withUdpSession } from './udp.js';

const UNCONNECTED_PING = 0x01;
const UNCONNECTED_PONG = 0x1c;

const MAGIC = Buffer.from([
    0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe,
    0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78,
]);

const PONG_HEADER_LENGTH = 1 + 8 + 8 + 16 + 2;

const ONLINE_FIELD = 4;
const MAX_FIELD = 5;

function buildPing(): Buffer {
    const packet = Buffer.alloc(1 + 8 + MAGIC.length + 8);

    packet.writeUInt8(UNCONNECTED_PING, 0);
    packet.writeBigInt64BE(BigInt(Date.now()), 1);
    MAGIC.copy(packet, 9);
    packet.writeBigInt64BE(BigInt(0), 9 + MAGIC.length);

    return packet;
}

export async function queryBedrock(target: PlayersQueryTarget): Promise<PlayersSample> {
    return withUdpSession(target.host, target.port, PLAYERS_QUERY_TIMEOUT_MS, async (send) => {
        const reply = await send(buildPing());

        if (reply.length < PONG_HEADER_LENGTH || reply.readUInt8(0) !== UNCONNECTED_PONG) {
            throw new Error('Unexpected RakNet pong');
        }

        const fields = reply.toString('utf8', PONG_HEADER_LENGTH).split(';');
        const online = Number.parseInt(fields[ONLINE_FIELD] ?? '', 10);
        const max = Number.parseInt(fields[MAX_FIELD] ?? '', 10);

        return {
            online: Number.isFinite(online) ? online : null,
            max: Number.isFinite(max) ? max : null,
            names: null,
        };
    });
}
