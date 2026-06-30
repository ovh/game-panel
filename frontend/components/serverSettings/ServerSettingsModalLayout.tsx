import { useRef, type ReactNode } from 'react';
import { X, FolderOpen, HardDrive, Settings, Terminal, Container, Clock } from 'lucide-react';
import { AppButton } from '../../src/ui/components';
import { useBodyScrollLock } from '../../src/ui/utils/useBodyScrollLock';
import { useFocusTrap } from '../../src/ui/utils/useFocusTrap';
import { useMediaQuery } from '../../src/ui/utils/useMediaQuery';
import type { SettingsTab } from './access';
import { ProviderLogo } from '../gameServersTable/ProviderBadge';

interface ServerSettingsModalLayoutProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  serverProvider?: string;
  modalBg: string;
  sidebarBg: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  hoverBg: string;
  canUseGameConfigTab: boolean;
  canShowBackupTab: boolean;
  canShowScheduledTasksTab: boolean;
  scheduledTasksContent: ReactNode;
  canAccessTab: (tab: SettingsTab) => boolean;
  openTab: (tab: SettingsTab) => void;
  tabButtonClass: (tab: SettingsTab) => string;
  activeTab: SettingsTab;
  fileManagerContent: ReactNode;
  backupContent: ReactNode;
  gameConfigContent: ReactNode;
  terminalContent: ReactNode;
  containerConfigContent: ReactNode;
}

export function ServerSettingsModalLayout({
  isOpen,
  onClose,
  serverName,
  serverProvider,
  modalBg,
  sidebarBg,
  borderColor,
  textPrimary,
  textSecondary,
  hoverBg,
  canUseGameConfigTab,
  canShowBackupTab,
  canShowScheduledTasksTab,
  scheduledTasksContent,
  canAccessTab,
  openTab,
  tabButtonClass,
  activeTab,
  fileManagerContent,
  backupContent,
  gameConfigContent,
  terminalContent,
  containerConfigContent,
}: ServerSettingsModalLayoutProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(isOpen);
  useFocusTrap(isOpen, dialogRef, { onEscape: onClose });
  // Windowed only on a genuinely large screen (desktop / tablet). A phone in landscape is wide but
  // short, so keying off width alone leaves it windowed — require height too, else go fullscreen.
  const isWindowed = useMediaQuery('(min-width: 768px) and (min-height: 600px)');
  if (!isOpen) return null;

  return (
    <div className={`gp-settings-modal fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-hidden ${isWindowed ? 'p-4' : 'p-0'}`}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gp-server-settings-title"
        tabIndex={-1}
        className={`${modalBg} shadow-2xl min-h-0 flex flex-col border ${borderColor} overflow-hidden focus:outline-none ${
          isWindowed ? 'w-[90vw] h-[85vh] max-w-6xl rounded-lg' : 'w-full h-full rounded-none'
        }`}
      >
        <div className={`flex items-center justify-between p-3 md:p-4 border-b ${borderColor}`}>
          <div className="min-w-0 flex-1">
            <h2 id="gp-server-settings-title" className={`text-base md:text-xl font-bold ${textPrimary} truncate`}>Server Settings</h2>
            <div className="flex items-center gap-2 min-w-0">
              <p className={`text-xs md:text-sm ${textSecondary} truncate`}>{serverName}</p>
              <ProviderLogo provider={serverProvider} height={18} />
            </div>
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
                {canShowBackupTab && (
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('backup')}
                  disabled={!canAccessTab('backup')}
                  className={`gp-settings-menu-btn flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap ${tabButtonClass('backup')}`}
                >
                  <HardDrive className="w-4 h-4" />
                  <span>Backups</span>
                </AppButton>
                )}
              {canShowScheduledTasksTab && (
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('scheduledtasks')}
                  disabled={!canAccessTab('scheduledtasks')}
                  className={`gp-settings-menu-btn flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap ${tabButtonClass('scheduledtasks')}`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Schedules</span>
                </AppButton>
              )}
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('terminal')}
                  disabled={!canAccessTab('terminal')}
                  className={`gp-settings-menu-btn flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap ${tabButtonClass('terminal')}`}
                >
                  <Terminal className="w-4 h-4" />
                  <span>Terminal</span>
                </AppButton>
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('containerconfig')}
                  disabled={!canAccessTab('containerconfig')}
                  className={`gp-settings-menu-btn flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap ${tabButtonClass('containerconfig')}`}
                >
                  <Container className="w-4 h-4" />
                  <span>Container</span>
                </AppButton>
            </nav>
          </div>

          <div className={`hidden md:block w-64 overflow-y-auto ${sidebarBg} border-r ${borderColor} p-4`}>
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
                {canShowBackupTab && (
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('backup')}
                  disabled={!canAccessTab('backup')}
                  className={`gp-settings-menu-btn w-full flex items-center gap-3 px-4 py-3 rounded ${tabButtonClass('backup')}`}
                >
                  <HardDrive className="w-5 h-5" />
                  <span className="font-medium">Backups</span>
                </AppButton>
                )}
              {canShowScheduledTasksTab && (
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('scheduledtasks')}
                  disabled={!canAccessTab('scheduledtasks')}
                  className={`gp-settings-menu-btn w-full flex items-center gap-3 px-4 py-3 rounded ${tabButtonClass('scheduledtasks')}`}
                >
                  <Clock className="w-5 h-5" />
                  <span className="font-medium">Scheduled Tasks</span>
                </AppButton>
              )}
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('terminal')}
                  disabled={!canAccessTab('terminal')}
                  className={`gp-settings-menu-btn w-full flex items-center gap-3 px-4 py-3 rounded ${tabButtonClass('terminal')}`}
                >
                  <Terminal className="w-5 h-5" />
                  <span className="font-medium">Terminal</span>
                </AppButton>
                <AppButton
                  tone="ghost"
                  onClick={() => openTab('containerconfig')}
                  disabled={!canAccessTab('containerconfig')}
                  className={`gp-settings-menu-btn w-full flex items-center gap-3 px-4 py-3 rounded ${tabButtonClass('containerconfig')}`}
                >
                  <Container className="w-5 h-5" />
                  <span className="font-medium">Container Config</span>
                </AppButton>
            </nav>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {/* Each tab renders its content only when the user can actually
                access it. Inaccessible tabs are greyed-out in the sidebar and
                can't be opened, so this is also a defensive guard. */}
            {!canAccessTab(activeTab) && (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div>
                  <p className={`text-sm font-medium ${textPrimary}`}>No access to this section</p>
                  <p className={`mt-1 text-xs ${textSecondary}`}>
                    You don't have permission to view or manage this part of the server's settings.
                  </p>
                </div>
              </div>
            )}
            {activeTab === 'filemanager' && canAccessTab('filemanager') && fileManagerContent}
            {activeTab === 'backup' && canAccessTab('backup') && backupContent}
            {activeTab === 'gameconfig' && canAccessTab('gameconfig') && gameConfigContent}
            {activeTab === 'terminal' && canAccessTab('terminal') && terminalContent}
            {activeTab === 'containerconfig' && canAccessTab('containerconfig') && containerConfigContent}
            {activeTab === 'scheduledtasks' && canAccessTab('scheduledtasks') && scheduledTasksContent}
          </div>
        </div>
      </div>
    </div>
  );
}



