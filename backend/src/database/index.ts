import {
    UserRepository,
    ServerMemberRepository,
    GameServerRepository,
    InstallationProgressRepository,
    InstallationInteractionRepository,
    ServerActionsRepository,
    ServerMetricsRepository,
    SystemMetricsRepository,
    LinuxGsmCatalogRepository,
    FileTransferJobRepository,
    ScheduledTaskRepository,
    PanelUpdateJobRepository,
} from './repositories.js';

export const userRepository = new UserRepository();
export const serverMemberRepository = new ServerMemberRepository();
export const serverRepository = new GameServerRepository();
export const installProgressRepository = new InstallationProgressRepository();
export const installInteractionRepository = new InstallationInteractionRepository();
export const actionsRepository = new ServerActionsRepository();
export const serverMetricsRepository = new ServerMetricsRepository();
export const systemMetricsRepository = new SystemMetricsRepository();
export const linuxGsmCatalogRepository = new LinuxGsmCatalogRepository();
export const fileTransferJobRepository = new FileTransferJobRepository();
export const scheduledTaskRepository = new ScheduledTaskRepository();
export const panelUpdateJobRepository = new PanelUpdateJobRepository();
