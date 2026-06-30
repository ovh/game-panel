import { normalizeEnvPayload } from '../../installPayload.js';

export type OvhcloudMinecraftEdition = 'java' | 'bedrock';
export type OvhcloudMinecraftServerType = 'vanilla' | 'paper' | 'fabric' | 'neoforge' | 'bedrock';

export type OvhcloudMinecraftImage = {
    imageId: string;
    edition: OvhcloudMinecraftEdition;
    serverType: OvhcloudMinecraftServerType;
    javaVersion: number | null;
};

const JAVA_IMAGE_RE = /^minecraft-(java-edition|paper|fabric|neoforge)-java(8|17|21|25)$/;

export const MINECRAFT_BACKUP_EXTENSIONS = ['.tar.gz'];

function javaServerTypeFromImageKind(kind: string): Exclude<OvhcloudMinecraftServerType, 'bedrock'> {
    if (kind === 'java-edition') return 'vanilla';
    return kind as Exclude<OvhcloudMinecraftServerType, 'bedrock'>;
}

export function getOvhcloudMinecraftImage(imageId: string): OvhcloudMinecraftImage | null {
    if (imageId === 'minecraft-bedrock-edition') {
        return {
            imageId,
            edition: 'bedrock',
            serverType: 'bedrock',
            javaVersion: null,
        };
    }

    const match = JAVA_IMAGE_RE.exec(imageId);
    if (!match) return null;

    const serverType = javaServerTypeFromImageKind(match[1]);
    return {
        imageId,
        edition: 'java',
        serverType,
        javaVersion: Number(match[2]),
    };
}

export function normalizeMinecraftEnv(
    _image: OvhcloudMinecraftImage,
    payload: unknown
): string[] {
    return normalizeEnvPayload(payload);
}

export function buildMinecraftProviderMetadata(image: OvhcloudMinecraftImage): Record<string, unknown> {
    return {
        imageId: image.imageId,
        family: 'minecraft',
        edition: image.edition,
        serverType: image.serverType,
        javaVersion: image.javaVersion,
        capabilities: {
            backup: {
                type: 'script',
                script: '/app/backup.sh',
                extensions: MINECRAFT_BACKUP_EXTENSIONS,
                supportsCold: true,
                includeServerArtifactEnv: 'BACKUP_INCLUDE_SERVER_ARTIFACT',
            },
            restore: {
                type: 'script',
                script: '/app/restore.sh',
                extensions: MINECRAFT_BACKUP_EXTENSIONS,
            },
            consoleCommand: {
                type: 'script',
                script: '/app/send-command.sh',
            },
        },
    };
}
