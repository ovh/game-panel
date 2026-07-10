import { apiClient } from '../../utils/api';
import { GameSettingsSection } from './GameSettingsSection';
import { ServerEnvFieldsCard, type EnvFieldDef } from './ServerEnvFieldsCard';

const ENV_FIELDS: EnvFieldDef[] = [
  {
    key: 'PALWORLD_ADMIN_PASSWORD',
    label: 'Admin Password',
    type: 'password',
    description: "Used for in-game admin actions and the server's REST API.",
  },
  {
    key: 'PALWORLD_UPDATE_ON_START',
    label: 'Update on start',
    type: 'toggle',
    defaultValue: 'false',
    description: 'When enabled, the server checks for and installs game updates via SteamCMD each time it starts.',
  },
];

export interface PalworldSectionsProps {
  serverId: number;
  serverStatus?: string | null;
  canReadSettings: boolean;
  canWriteSettings: boolean;
  canManageEnv?: boolean;
  canEditContainerConfig?: boolean;
  containerConfigSaveCount?: number;
  advancedLinksNode?: React.ReactNode;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
  textSecondary: string;
}

export function PalworldSections({
  serverId,
  serverStatus,
  canReadSettings,
  canWriteSettings,
  canManageEnv,
  canEditContainerConfig,
  containerConfigSaveCount,
  advancedLinksNode,
  borderColor,
  contentBg,
  textPrimary,
  textSecondary,
}: PalworldSectionsProps) {
  if (!canReadSettings && !canManageEnv) return null;

  return (
    <div className="space-y-4">
      {canReadSettings && (
        <GameSettingsSection
          serverId={serverId}
          serverStatus={serverStatus}
          canRead={canReadSettings}
          canWrite={canWriteSettings}
          load={(id) => apiClient.getPalworldSettings(id)}
          save={(id, changed) => apiClient.patchPalworldSettings(id, changed)}
          borderColor={borderColor}
          contentBg={contentBg}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
      )}
      {canManageEnv && (
        <ServerEnvFieldsCard
          serverId={serverId}
          serverStatus={serverStatus}
          fields={ENV_FIELDS}
          canEdit={Boolean(canManageEnv && canEditContainerConfig)}
          containerConfigSaveCount={containerConfigSaveCount}
          borderColor={borderColor}
          contentBg={contentBg}
          textPrimary={textPrimary}
        />
      )}
      {advancedLinksNode && <div>{advancedLinksNode}</div>}
    </div>
  );
}
