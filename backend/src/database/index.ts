import {
    UserRepository,
    ServerMemberRepository,
    GameServerRepository,
    InstallationProgressRepository,
    ServerActionsRepository,
    ServerMetricsRepository,
    SystemMetricsRepository,
} from './repositories.js';

export const userRepository = new UserRepository();
export const serverMemberRepository = new ServerMemberRepository();
export const serverRepository = new GameServerRepository();
export const installProgressRepository = new InstallationProgressRepository();
export const actionsRepository = new ServerActionsRepository();
export const serverMetricsRepository = new ServerMetricsRepository();
export const systemMetricsRepository = new SystemMetricsRepository();
