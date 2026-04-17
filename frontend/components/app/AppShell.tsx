import { Menu } from 'lucide-react';
import { Sidebar } from '../Sidebar';
import { HostStatus } from '../HostStatus';
import { GameServersTable } from '../GameServersTable';
import { NewsPanel } from '../NewsPanel';
import { InstallGameServer } from '../InstallGameServer';
import { Resources } from '../Resources';
import { UserAdministration } from '../UserAdministration';
import { ServerConsoleTabs } from '../ServerConsoleTabs';
import { ServerConsoleTerminalModal } from '../ServerConsoleTerminalModal';
import { LogPromptToasts } from '../LogPromptToasts';
import { ConfirmationModal } from '../ConfirmationModal';
import { ChangePasswordModal } from '../ChangePasswordModal';
import { AppPageLayout } from '../../src/ui/layout';
import type { CLIMessage } from '../../types/cli';
import type { GameServer } from '../../types/gameServer';
import type { AuthUser } from '../../utils/permissions';
import type {
  ServerHistoryById,
  ServerLogs,
  ServerMetricHistoryPoint,
} from '../../utils/serverRuntime';
import type { ActiveLogPromptToast, ConsoleTerminalTarget } from './appRuntime';
import { AppButton } from '../../src/ui/components';

interface AppShellProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  handleRequestLogout: () => void;
  handleOpenChangePassword: () => void;
  canManageUsers: boolean;
  currentUser: AuthUser | null;
  pageShellClassName: string;
  gameServers: GameServer[];
  serverMetricsHistoryById: Record<string, ServerMetricHistoryPoint[]>;
  serverHistoryById: ServerHistoryById;
  gameNamesByKey: Record<string, string>;
  consoleReadyByServer: Record<string, boolean | null>;
  serverPermissionsById: Record<string, string[]>;
  handleDeleteServer: (id: string) => Promise<void>;
  handleServerAction: (serverId: string, serverName: string, action: string) => Promise<void>;
  openConsoleTerminal: (serverId: number, serverName: string) => void;
  handleRenameServer: (id: string, newName: string) => Promise<void>;
  handleRefreshServerSnapshot: () => Promise<void>;
  handleStartAll: () => void;
  handleStopAll: () => void;
  canInstallServers: boolean;
  installModalOpen: boolean;
  setInstallModalOpen: (open: boolean) => void;
  handleInstallGame: (...args: any[]) => Promise<void>;
  installing: boolean;
  installError: string | null;
  installProgressPercent: number | null;
  installStatus: string | null;
  installServerId: number | null;
  installPermissionsSyncing: boolean;
  usedInstallPorts: { tcp: Set<number>; udp: Set<number> };
  handleClearInstallError: () => void;
  openInstallLogs: (serverId: number) => void;
  serverLogs: ServerLogs;
  cliMessages: CLIMessage[];
  handleClearServerLogs: (serverId: string) => void;
  handleClearCLI: () => void;
  activeConsoleTab: string | null;
  setActiveConsoleTab: (tab: string | null) => void;
  handleCloseConsoleTab: (serverId: string) => void;
  openConsoleTabs: string[];
  consoleTerminalTarget: ConsoleTerminalTarget | null;
  setConsoleTerminalTarget: (target: ConsoleTerminalTarget | null) => void;
  activeLogPromptToasts: ActiveLogPromptToast[];
  removeLogPromptToast: (toastId: string) => void;
  logoutConfirmOpen: boolean;
  setLogoutConfirmOpen: (open: boolean) => void;
  handleLogout: () => void;
  changePasswordOpen: boolean;
  setChangePasswordOpen: (open: boolean) => void;
  currentUserId: number | null;
}

export function AppShell({
  activeTab,
  setActiveTab,
  mobileMenuOpen,
  setMobileMenuOpen,
  handleRequestLogout,
  handleOpenChangePassword,
  canManageUsers,
  currentUser,
  pageShellClassName,
  gameServers,
  serverMetricsHistoryById,
  serverHistoryById,
  gameNamesByKey,
  consoleReadyByServer,
  serverPermissionsById,
  handleDeleteServer,
  handleServerAction,
  openConsoleTerminal,
  handleRenameServer,
  handleRefreshServerSnapshot,
  handleStartAll,
  handleStopAll,
  canInstallServers,
  installModalOpen,
  setInstallModalOpen,
  handleInstallGame,
  installing,
  installError,
  installProgressPercent,
  installStatus,
  installServerId,
  installPermissionsSyncing,
  usedInstallPorts,
  handleClearInstallError,
  openInstallLogs,
  serverLogs,
  cliMessages,
  handleClearServerLogs,
  handleClearCLI,
  activeConsoleTab,
  setActiveConsoleTab,
  handleCloseConsoleTab,
  openConsoleTabs,
  consoleTerminalTarget,
  setConsoleTerminalTarget,
  activeLogPromptToasts,
  removeLogPromptToast,
  logoutConfirmOpen,
  setLogoutConfirmOpen,
  handleLogout,
  changePasswordOpen,
  setChangePasswordOpen,
  currentUserId,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen overflow-x-hidden bg-transparent">
      <div className="hidden md:block">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLogout={handleRequestLogout}
          onChangePassword={handleOpenChangePassword}
          canManageUsers={canManageUsers}
          currentUser={currentUser}
        />
      </div>

      <div className="md:hidden fixed top-0 left-0 right-0 z-40 border-b border-gray-800 bg-[#111827]">
        <div className="flex items-center justify-between p-4">
          <AppButton
            onClick={() => setMobileMenuOpen(true)}
            tone="ghost"
            className="h-10 w-10 rounded-lg border-none bg-transparent p-2 hover:bg-gray-800"
          >
            <Menu className="w-6 h-6 text-white" />
          </AppButton>
          <h1 className="text-base font-bold truncate max-w-[70%] text-white">
            OVHcloud Game Panel
          </h1>
          <div className="w-10"></div>
        </div>
      </div>

      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed top-0 left-0 bottom-0 w-[280px] z-50 md:hidden overflow-y-auto bg-[#111827]">
            <Sidebar
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                setMobileMenuOpen(false);
              }}
              onLogout={handleRequestLogout}
              onChangePassword={handleOpenChangePassword}
              canManageUsers={canManageUsers}
              staticLayout
              currentUser={currentUser}
            />
          </div>
        </>
      )}

      <main className="flex-1 w-full overflow-x-hidden bg-transparent pt-16 md:pl-52 md:pt-0">
        {activeTab === 'host-status' && (
          <AppPageLayout className={pageShellClassName}>
            <HostStatus />
          </AppPageLayout>
        )}

        {activeTab === 'game-servers' && (
          <AppPageLayout className={pageShellClassName}>
            <div className="mb-6">
              <NewsPanel />
            </div>

            <GameServersTable
              servers={gameServers}
              metricsHistoryByServer={serverMetricsHistoryById}
              historyByServer={serverHistoryById}
              gameNamesByKey={gameNamesByKey}
              terminalReadyByServer={consoleReadyByServer}
              currentUser={currentUser}
              permissionsByServer={serverPermissionsById}
              onDelete={handleDeleteServer}
              onAction={handleServerAction}
              onOpenConsoleTerminal={(serverId, serverName) =>
                openConsoleTerminal(Number(serverId), serverName)
              }
              onRename={handleRenameServer}
              onRefresh={handleRefreshServerSnapshot}
              onStartAll={handleStartAll}
              onStopAll={handleStopAll}
              canInstall={canInstallServers}
              onOpenInstallModal={() => setInstallModalOpen(true)}
            />

            <InstallGameServer
              isOpen={installModalOpen}
              onClose={() => setInstallModalOpen(false)}
              onInstall={handleInstallGame}
              canInstall={canInstallServers}
              installing={installing}
              installError={installError}
              installProgressPercent={installProgressPercent}
              installStatus={installStatus}
              installServerId={installServerId}
              installPermissionsSyncing={installPermissionsSyncing}
              canOpenInstallLog={installServerId !== null}
              usedPorts={{
                tcp: Array.from(usedInstallPorts.tcp).sort((a, b) => a - b),
                udp: Array.from(usedInstallPorts.udp).sort((a, b) => a - b),
              }}
              usedServerNames={gameServers.map((server) => server.name)}
              onClearError={handleClearInstallError}
              onOpenConsole={openInstallLogs}
            />

            <div id="server-console-logs" className="mt-6 mb-6 sm:mb-8 lg:mb-10">
              <ServerConsoleTabs
                servers={gameServers}
                logs={serverLogs}
                cliMessages={cliMessages}
                consoleReadyByServer={consoleReadyByServer}
                onClearLogs={handleClearServerLogs}
                onClearCLI={handleClearCLI}
                activeTab={activeConsoleTab}
                onSetActiveTab={setActiveConsoleTab}
                onCloseTab={handleCloseConsoleTab}
                openTabs={openConsoleTabs}
              />
            </div>
          </AppPageLayout>
        )}

        {activeTab === 'resources' && (
          <AppPageLayout className={pageShellClassName}>
            <Resources />
          </AppPageLayout>
        )}

        {activeTab === 'admin-users' && (
          <AppPageLayout className={pageShellClassName}>
            <UserAdministration
              servers={gameServers}
              currentUserId={currentUserId}
              canManageUsers={canManageUsers}
            />
          </AppPageLayout>
        )}
      </main>

      <ServerConsoleTerminalModal
        isOpen={Boolean(consoleTerminalTarget)}
        serverId={consoleTerminalTarget?.serverId ?? null}
        serverName={consoleTerminalTarget?.serverName ?? 'Server'}
        onClose={() => setConsoleTerminalTarget(null)}
      />

      <LogPromptToasts toasts={activeLogPromptToasts} onClose={removeLogPromptToast} />

      <ConfirmationModal
        isOpen={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
        title="Log out?"
        message="Are you sure you want to log out of the panel?"
        confirmText="Log out"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        showCloseButton={false}
        icon="danger"
      />

      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </div>
  );
}


