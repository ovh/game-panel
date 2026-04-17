import Docker from 'dockerode';
import { getConfig } from '../../config.js';

const { dockerSocket } = getConfig();

export const docker = new Docker({
    socketPath: dockerSocket,
});
