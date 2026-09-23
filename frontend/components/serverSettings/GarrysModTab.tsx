import { useState } from 'react';
import { OvhcloudSettingsSection } from './OvhcloudSettingsSection';
import { GameWipeTab } from './GameWipeTab';
import { buildWipeModes } from './wipeModes';

// Garry's Mod is "Counter-Strike 2 without the frameworks" (see garrys-mod-frontend.md):
// only Settings (shared settings screen) and, when supported, a hard-only Wipe.
type GarrysModSubTab = 'settings' | 'wipe';

export interface GarrysModSectionsProps {
  serverId: number;
  serverStatus?: string | null;
  canEdit: boolean;
  canWipeHard?: boolean;
  onReinstallStarted?: () => void;
  canManageEnv: boolean;
  canReadFileManager?: boolean;
  onOpenFileManagerPath?: (path: string) => void;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
  textSecondary: string;
}

export function GarrysModSections({
  serverId,
  serverStatus,
  canEdit,
  canWipeHard,
  onReinstallStarted,
  canManageEnv,
  canReadFileManager,
  onOpenFileManagerPath,
  borderColor,
  contentBg,
  textPrimary,
  textSecondary,
}: GarrysModSectionsProps) {
  const showWipeTab = buildWipeModes('garrys-mod', {
    canSoft: false,
    canHard: Boolean(canWipeHard),
  }).length > 0;

  const availableTabs: GarrysModSubTab[] = [
    ...(canManageEnv ? (['settings'] as GarrysModSubTab[]) : []),
    ...(showWipeTab ? (['wipe'] as GarrysModSubTab[]) : []),
  ];
  const [activeTab, setActiveTab] = useState<GarrysModSubTab>(availableTabs[0]);
  const [visited, setVisited] = useState<Set<GarrysModSubTab>>(() => new Set([availableTabs[0]]));

  const switchTab = (id: GarrysModSubTab) => {
    setActiveTab(id);
    setVisited((prev) => new Set([...prev, id]));
  };

  return (
    <div>
      {availableTabs.length > 1 && (
        <div className={`flex flex-wrap border-b ${borderColor} mb-3`}>
          {availableTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => switchTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? 'border-[var(--color-cyan-400)] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
              }`}
            >
              {tab === 'settings' ? 'Settings' : 'Wipe'}
            </button>
          ))}
        </div>
      )}

      {canManageEnv && visited.has('settings') && (
        <div className={activeTab !== 'settings' ? 'hidden' : ''}>
          <OvhcloudSettingsSection
            serverId={serverId}
            serverStatus={serverStatus}
            canWriteLaunch={canEdit}
            canReadFileManager={canReadFileManager}
            onOpenFileManagerPath={onOpenFileManagerPath}
            borderColor={borderColor}
            contentBg={contentBg}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
        </div>
      )}

      {visited.has('wipe') && showWipeTab && (
        <div className={activeTab !== 'wipe' ? 'hidden' : ''}>
          <GameWipeTab
            family="garrys-mod"
            serverId={serverId}
            serverStatus={serverStatus}
            canWipeSoft={false}
            canWipeHard={Boolean(canWipeHard)}
            onReinstallStarted={onReinstallStarted}
            borderColor={borderColor}
            contentBg={contentBg}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
        </div>
      )}
    </div>
  );
}
