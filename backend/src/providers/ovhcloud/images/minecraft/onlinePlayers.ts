import type { GameServerRow } from '../../../../types/gameServer.js';
import { queryBedrock } from '../../../../services/players/protocols/bedrock.js';
import { queryMinecraftJava } from '../../../../services/players/protocols/minecraft.js';
import { GAME_PORT_LABEL, resolveContainerPort } from '../../../../services/players/resolve.js';
import { getOvhcloudMinecraftMetadata } from '../../../serverMetadata.js';
import type { OvhcloudPlayersSupport } from '../../adapters/types.js';

const DEFAULT_JAVA_PORT = 25565;
const DEFAULT_BEDROCK_PORT = 19132;

function isBedrock(server: GameServerRow): boolean {
    return getOvhcloudMinecraftMetadata(server).edition === 'bedrock';
}

export const minecraftPlayersSupport: OvhcloudPlayersSupport = {
    resolvePort(server: GameServerRow): number {
        return isBedrock(server)
            ? resolveContainerPort(server, 'udp', GAME_PORT_LABEL, DEFAULT_BEDROCK_PORT)
            : resolveContainerPort(server, 'tcp', GAME_PORT_LABEL, DEFAULT_JAVA_PORT);
    },

    query(server, target) {
        return isBedrock(server) ? queryBedrock(target) : queryMinecraftJava(target);
    },
};
