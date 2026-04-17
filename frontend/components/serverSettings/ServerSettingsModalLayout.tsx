import type { ReactNode } from 'react';
import { X, FolderOpen, HardDrive, Key, Settings, Terminal } from 'lucide-react';
import { AppButton } from '../../src/ui/components';

type SettingsTab = 'filemanager' | 'backup' | 'sftp' | 'gameconfig' | 'terminal';

interface ServerSettingsModalLayoutProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  modalBg: string;
  sidebarBg: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  hoverBg: string;
  canUseGameConfigTab: boolean;
  canAccessTab: (tab: SettingsTab) => boolean;
  openTab: (tab: SettingsTab) => void;
  tabButtonClass: (tab: SettingsTab) => string;
  hasAnySettingsAccess: boolean;
  activeTab: SettingsTab;
  fileManagerContent: ReactNode;
  backupContent: ReactNode;
  sftpContent: ReactNode;
  gameConfigContent: ReactNode;
  terminalContent: ReactNode;
}

export function ServerSettingsModalLayout({
  isOpen,
  onClose,
  serverName,
  modalBg,
  sidebarBg,
  borderColor,
  textPrimary,
  textSecondary,
  hoverBg,
  canUseGameConfigTab,
  canAccessTab,
  openTab,
  tabButtonClass,
  hasAnySettingsAccess,
  activeTab,
  fileManagerContent,
  backupContent,
  sftpContent,
  gameConfigContent,
  terminalContent,
}: ServerSettingsModalLayoutProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 overflow-hidden">
      <div
        className={`${modalBg} rounded-lg shadow-2xl w-full h-full min-h-0 md:w-[90vw] md:h-[85vh] md:max-w-6xl flex flex-col border ${borderColor} overflow-hidden`}
      >
        <div className={`flex items-center justify-between p-3 md:p-4 border-b ${borderColor}`}>
          <div className="min-w-0 flex-1">
            <h2 className={`text-base md:text-xl font-bold ${textPrimary} truncate`}>Server Settings</h2>
            <p className={`text-xs md:text-sm ${textSecondary} truncate`}>{serverName}</p>
          </div>
          <AppButton
            onClick={onClose}
            className={`p-2 rounded ${hoverBg} transition-colors ${textSecondary} hover:text-red-400 flex-shrink-0 ml-2`}
          >
            <X className="w-5 h-5" />
          </AppButton>
        </div>

        <div className="flex min-h-0 flex-col md:flex-row flex-1 overflow-hidden">
          <div className={`md:hidden ${sidebarBg} border-b ${borderColor}`}>
            <nav className="flex flex-wrap p-2 gap-2">
              {canUseGameConfigTab && (
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('gameconfig')}
                  disabled={!canAccessTab('gameconfig')}
                  className={`gp-settings-menu-btn flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap ${tabButtonClass('gameconfig')}`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Config</span>
                </AppButton>
              )}
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('filemanager')}
                  disabled={!canAccessTab('filemanager')}
                  className={`gp-settings-menu-btn flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap ${tabButtonClass('filemanager')}`}
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>Files</span>
                </AppButton>
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('backup')}
                  disabled={!canAccessTab('backup')}
                  className={`gp-settings-menu-btn flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap ${tabButtonClass('backup')}`}
                >
                  <HardDrive className="w-4 h-4" />
                  <span>Backups</span>
                </AppButton>
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('sftp')}
                  disabled={!canAccessTab('sftp')}
                  className={`gp-settings-menu-btn flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap ${tabButtonClass('sftp')}`}
                >
                  <Key className="w-4 h-4" />
                  <span>SFTP</span>
                </AppButton>
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('terminal')}
                  disabled={!canAccessTab('terminal')}
                  className={`gp-settings-menu-btn flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap ${tabButtonClass('terminal')}`}
                >
                  <Terminal className="w-4 h-4" />
                  <span>SSH Terminal</span>
                </AppButton>
            </nav>
          </div>

          <div className={`hidden md:block w-64 ${sidebarBg} border-r ${borderColor} p-4`}>
            <nav className="space-y-2">
              {canUseGameConfigTab && (
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('gameconfig')}
                  disabled={!canAccessTab('gameconfig')}
                  className={`gp-settings-menu-btn w-full flex items-center gap-3 px-4 py-3 rounded ${tabButtonClass('gameconfig')}`}
                >
                  <Settings className="w-5 h-5" />
                  <span className="font-medium">Game Config</span>
                </AppButton>
              )}
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('filemanager')}
                  disabled={!canAccessTab('filemanager')}
                  className={`gp-settings-menu-btn w-full flex items-center gap-3 px-4 py-3 rounded ${tabButtonClass('filemanager')}`}
                >
                  <FolderOpen className="w-5 h-5" />
                  <span className="font-medium">File Manager</span>
                </AppButton>
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('backup')}
                  disabled={!canAccessTab('backup')}
                  className={`gp-settings-menu-btn w-full flex items-center gap-3 px-4 py-3 rounded ${tabButtonClass('backup')}`}
                >
                  <HardDrive className="w-5 h-5" />
                  <span className="font-medium">Backups</span>
                </AppButton>
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('sftp')}
                  disabled={!canAccessTab('sftp')}
                  className={`gp-settings-menu-btn w-full flex items-center gap-3 px-4 py-3 rounded ${tabButtonClass('sftp')}`}
                >
                  <Key className="w-5 h-5" />
                  <span className="font-medium">SFTP</span>
                </AppButton>
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('terminal')}
                  disabled={!canAccessTab('terminal')}
                  className={`gp-settings-menu-btn w-full flex items-center gap-3 px-4 py-3 rounded ${tabButtonClass('terminal')}`}
                >
                  <Terminal className="w-5 h-5" />
                  <span className="font-medium">SSH Terminal</span>
                </AppButton>
            </nav>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {!hasAnySettingsAccess && (
              <div className="p-6 text-sm text-red-300">
                Access denied. You do not have permissions for this server.
              </div>
            )}
            {hasAnySettingsAccess && activeTab === 'filemanager' && fileManagerContent}
            {hasAnySettingsAccess && activeTab === 'backup' && backupContent}
            {hasAnySettingsAccess && activeTab === 'sftp' && sftpContent}
            {hasAnySettingsAccess && activeTab === 'gameconfig' && gameConfigContent}
            {hasAnySettingsAccess && activeTab === 'terminal' && terminalContent}
          </div>
        </div>
      </div>
    </div>
  );
}



