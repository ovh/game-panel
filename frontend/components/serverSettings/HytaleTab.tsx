import { useState } from 'react';
import { apiClient } from '../../utils/api';
import { GameSettingsSection } from './GameSettingsSection';
import { ModsSection } from './ModsSection';

export interface HytaleSectionsProps {
  serverId: number;
  serverStatus?: string | null;
  canReadSettings: boolean;
  canWriteSettings: boolean;
  canReadMods: boolean;
  canWriteMods: boolean;
  advancedLinksNode?: React.ReactNode;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
  textSecondary: string;
}

// ── HytaleSections (horizontal sub-tabs) ─────────────────────────────────

type HytaleSubTab = 'settings' | 'mods';

export function HytaleSections({
  serverId,
  serverStatus,
  canReadSettings,
  canWriteSettings,
  canReadMods,
  canWriteMods,
  advancedLinksNode,
  borderColor,
  contentBg,
  textPrimary,
  textSecondary,
}: HytaleSectionsProps) {
  const tabs: { id: HytaleSubTab; label: string }[] = [
    canReadSettings && { id: 'settings', label: 'Server Settings' },
    canReadMods     && { id: 'mods',     label: 'Mods' },
  ].filter(Boolean) as { id: HytaleSubTab; label: string }[];

  const firstTab = tabs[0]?.id ?? 'settings';
  const [activeTab, setActiveTab] = useState<HytaleSubTab>(firstTab);
  const [visited, setVisited] = useState<Set<HytaleSubTab>>(() => new Set([firstTab]));

  const switchTab = (id: HytaleSubTab) => {
    setActiveTab(id);
    setVisited((prev) => new Set([...prev, id]));
  };

  if (tabs.length === 0) return null;

  return (
    <div>
      {/* Horizontal tab bar — only shown when there are multiple tabs */}
      {tabs.length > 1 && (
        <div className={`flex flex-wrap border-b ${borderColor} mb-3 gap-0`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-[var(--color-cyan-400)] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {visited.has('settings') && canReadSettings && (
        <div className={activeTab !== 'settings' ? 'hidden' : ''}>
          <GameSettingsSection
            serverId={serverId}
            serverStatus={serverStatus}
            canRead={canReadSettings}
            canWrite={canWriteSettings}
            load={(id) => apiClient.getHytaleSettings(id)}
            save={(id, changed) => apiClient.patchHytaleSettings(id, changed)}
            borderColor={borderColor}
            contentBg={contentBg}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
          <div className="mt-3">{advancedLinksNode}</div>
        </div>
      )}
      {visited.has('mods') && canReadMods && (
        <div className={activeTab !== 'mods' ? 'hidden' : ''}>
          <ModsSection
            serverId={serverId}
            kind="mods"
            apiKind="hytale"
            canRead={canReadMods}
            canWrite={canWriteMods}
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
