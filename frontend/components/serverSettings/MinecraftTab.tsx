import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { AppButton } from '../../src/ui/components';
import { apiClient } from '../../utils/api';
import { GameSettingsSection } from './GameSettingsSection';
import { ModsSection } from './ModsSection';
import { MinecraftVersionPicker } from '../MinecraftVersionPicker';
import { getPickerManagedKeys, type McServerType } from '../../utils/minecraftCatalog';

// ── Types ──────────────────────────────────────────────────────────────────

type Operator = { uuid: string; name: string; level: number; bypassesPlayerLimit: boolean };
type WhitelistPlayer = { uuid: string; name: string };
type PlayerBan = { name: string; uuid?: string; reason?: string; created?: string; expires?: string; source?: string };
type IpBan = { ip: string; reason?: string; created?: string; expires?: string; source?: string };

export interface MinecraftSectionsProps {
  serverId: number;
  serverStatus?: string | null;
  canReadSettings: boolean;
  canWriteSettings: boolean;
  advancedLinksNode?: React.ReactNode;
  canReadOperators: boolean;
  canWriteOperators: boolean;
  canReadWhitelist: boolean;
  canWriteWhitelist: boolean;
  canReadBans: boolean;
  canWriteBans: boolean;
  canReadIpBans: boolean;
  canWriteIpBans: boolean;
  canReadAddons: boolean;
  canWriteAddons: boolean;
  addonKind: 'plugins' | 'mods';
  borderColor: string;
  contentBg: string;
  textPrimary: string;
  textSecondary: string;
  mcServerType?: McServerType | null;
  canEditVersion?: boolean;
  /** Whether the caller holds `server.env`; the env-backed version picker is hidden when false. */
  canManageEnv?: boolean;
  containerConfigSaveCount?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function SectionCard({ title, children, borderColor, contentBg, textPrimary }: {
  title: string;
  children: React.ReactNode;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
}) {
  return (
    <div className={`${contentBg} border ${borderColor} rounded-lg p-4 space-y-3`}>
      <h4 className={`text-base font-semibold ${textPrimary}`}>{title}</h4>
      {children}
    </div>
  );
}

function ServerRunningWarning({ serverStatus }: { serverStatus?: string | null }) {
  if (serverStatus === 'running') return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>The server must be <strong>running</strong> to use this feature.</span>
    </div>
  );
}

function ErrorMsg({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-sm text-red-400">{error}</p>;
}

const MC_NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const validateMcName = (name: string) => MC_NAME_RE.test(name.trim());


// ── Operators Section ──────────────────────────────────────────────────────

function OperatorsSection({
  serverId, serverStatus, canRead, canWrite, isActive, borderColor, contentBg, textPrimary, textSecondary,
}: {
  serverId: number; serverStatus?: string | null; canRead: boolean; canWrite: boolean; isActive: boolean;
  borderColor: string; contentBg: string; textPrimary: string; textSecondary: string;
}) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingName, setRemovingName] = useState<string | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getMinecraftOperators(serverId);
      setOperators(data.operators);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load operators.');
    } finally {
      setLoading(false);
    }
  }, [serverId, canRead]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { void load(); }, []); // eslint-disable-line
  const firstActiveRef = useRef(true);
  useEffect(() => {
    if (firstActiveRef.current) { firstActiveRef.current = false; return; }
    if (isActive) void loadRef.current();
  }, [isActive]);

  const handleAdd = async () => {
    const name = addName.trim();
    if (!canWrite || !validateMcName(name) || adding) return;
    setAdding(true);
    setError(null);
    try {
      await apiClient.addMinecraftOperator(serverId, name);
      setAddName('');
      setTimeout(() => void load(), 600);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to add operator.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (name: string) => {
    if (!canWrite || removingName) return;
    setRemovingName(name);
    setError(null);
    try {
      await apiClient.removeMinecraftOperator(serverId, name);
      setTimeout(() => void load(), 600);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to remove operator.');
    } finally {
      setRemovingName(null);
    }
  };

  const inputCls = `flex-1 bg-gp-surface-input border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-cyan-400)]`;
  const canWriteNow = canWrite && serverStatus === 'running';

  return (
    <SectionCard title="Operators" borderColor={borderColor} contentBg={contentBg} textPrimary={textPrimary}>
      <ServerRunningWarning serverStatus={serverStatus} />
      {loading && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div>}
      <ErrorMsg error={error} />
      {canWriteNow && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            className={inputCls}
            placeholder="Player name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
            maxLength={16}
          />
          <AppButton
            onClick={handleAdd}
            disabled={adding || !validateMcName(addName)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm flex-shrink-0"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Op
          </AppButton>
        </div>
      )}
      {!loading && operators.length === 0 && !error && (
        <p className={`text-sm ${textSecondary}`}>No operators configured.</p>
      )}
      {operators.length > 0 && (
        <div className="space-y-2">
          {operators.map((op) => (
            <div key={op.uuid} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${borderColor} bg-gray-900/30`}>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${textPrimary}`}>{op.name}</p>
                {op.bypassesPlayerLimit && <p className={`text-xs ${textSecondary}`}>Bypasses player limit</p>}
              </div>
              {canWriteNow && (
                <AppButton
                  tone="critical"
                  onClick={() => handleRemove(op.name)}
                  disabled={removingName === op.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs flex-shrink-0"
                >
                  {removingName === op.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Remove
                </AppButton>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Whitelist Section ──────────────────────────────────────────────────────

function WhitelistSection({
  serverId, serverStatus, canRead, canWrite, isActive, borderColor, contentBg, textPrimary, textSecondary,
}: {
  serverId: number; serverStatus?: string | null; canRead: boolean; canWrite: boolean; isActive: boolean;
  borderColor: string; contentBg: string; textPrimary: string; textSecondary: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [players, setPlayers] = useState<WhitelistPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingName, setRemovingName] = useState<string | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getMinecraftWhitelist(serverId);
      setEnabled(data.whitelist.enabled);
      setPlayers(data.whitelist.players);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load whitelist.');
    } finally {
      setLoading(false);
    }
  }, [serverId, canRead]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { void load(); }, []); // eslint-disable-line
  const firstActiveRef = useRef(true);
  useEffect(() => {
    if (firstActiveRef.current) { firstActiveRef.current = false; return; }
    if (isActive) void loadRef.current();
  }, [isActive]);

  const handleToggle = async () => {
    if (!canWrite || toggling) return;
    setToggling(true);
    setError(null);
    try {
      await apiClient.patchMinecraftWhitelist(serverId, !enabled);
      setTimeout(() => void load(), 600);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to toggle whitelist.');
    } finally {
      setToggling(false);
    }
  };

  const handleAdd = async () => {
    const name = addName.trim();
    if (!canWrite || !validateMcName(name) || adding) return;
    setAdding(true);
    setError(null);
    try {
      await apiClient.addMinecraftWhitelistPlayer(serverId, name);
      setAddName('');
      setTimeout(() => void load(), 600);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to add player.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (name: string) => {
    if (!canWrite || removingName) return;
    setRemovingName(name);
    setError(null);
    try {
      await apiClient.removeMinecraftWhitelistPlayer(serverId, name);
      setTimeout(() => void load(), 600);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to remove player.');
    } finally {
      setRemovingName(null);
    }
  };

  const inputCls = `flex-1 bg-gp-surface-input border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-cyan-400)]`;
  const canWriteNow = canWrite && serverStatus === 'running';

  return (
    <SectionCard title="Whitelist" borderColor={borderColor} contentBg={contentBg} textPrimary={textPrimary}>
      <ServerRunningWarning serverStatus={serverStatus} />
      {loading && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div>}
      <ErrorMsg error={error} />
      {!loading && (
        <>
          <div className={`flex items-center justify-between p-3 rounded-lg border ${borderColor} bg-gray-900/30`}>
            <div>
              <p className={`text-sm font-medium ${textPrimary}`}>Whitelist enabled</p>
              <p className={`text-xs ${textSecondary}`}>Only whitelisted players and operators can join.</p>
            </div>
            <button
              type="button"
              onClick={handleToggle}
              disabled={!canWriteNow || toggling}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-200 ${enabled ? 'left-[19px]' : 'left-[3px]'}`} />
            </button>
          </div>
          {canWriteNow && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                className={inputCls}
                placeholder="Player name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                maxLength={16}
              />
              <AppButton
                onClick={handleAdd}
                disabled={adding || !validateMcName(addName)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm flex-shrink-0"
              >
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add
              </AppButton>
            </div>
          )}
          {players.length === 0 && !error && (
            <p className={`text-sm ${textSecondary}`}>No players on the whitelist.</p>
          )}
          {players.length > 0 && (
            <div className="space-y-2">
              {players.map((p) => (
                <div key={p.uuid} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${borderColor} bg-gray-900/30`}>
                  <p className={`text-sm font-medium ${textPrimary}`}>{p.name}</p>
                  {canWriteNow && (
                    <AppButton
                      tone="critical"
                      onClick={() => handleRemove(p.name)}
                      disabled={removingName === p.name}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs flex-shrink-0"
                    >
                      {removingName === p.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Remove
                    </AppButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

// ── Player Bans Section ────────────────────────────────────────────────────

function PlayerBansSection({
  serverId, serverStatus, canRead, canWrite, isActive, borderColor, contentBg, textPrimary, textSecondary,
}: {
  serverId: number; serverStatus?: string | null; canRead: boolean; canWrite: boolean; isActive: boolean;
  borderColor: string; contentBg: string; textPrimary: string; textSecondary: string;
}) {
  const [bans, setBans] = useState<PlayerBan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banName, setBanName] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const [unbanningName, setUnbanningName] = useState<string | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getMinecraftPlayerBans(serverId);
      setBans(data.bans);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load bans.');
    } finally {
      setLoading(false);
    }
  }, [serverId, canRead]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { void load(); }, []); // eslint-disable-line
  const firstActiveRef = useRef(true);
  useEffect(() => {
    if (firstActiveRef.current) { firstActiveRef.current = false; return; }
    if (isActive) void loadRef.current();
  }, [isActive]);

  const handleBan = async () => {
    const name = banName.trim();
    if (!canWrite || !validateMcName(name) || banning) return;
    setBanning(true);
    setError(null);
    try {
      await apiClient.banMinecraftPlayer(serverId, name, banReason.trim() || undefined);
      setBanName('');
      setBanReason('');
      setTimeout(() => void load(), 600);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to ban player.');
    } finally {
      setBanning(false);
    }
  };

  const handleUnban = async (name: string) => {
    if (!canWrite || unbanningName) return;
    setUnbanningName(name);
    setError(null);
    try {
      await apiClient.unbanMinecraftPlayer(serverId, name);
      setTimeout(() => void load(), 600);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to unban player.');
    } finally {
      setUnbanningName(null);
    }
  };

  const inputCls = `bg-gp-surface-input border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-cyan-400)]`;
  const canWriteNow = canWrite && serverStatus === 'running';

  return (
    <SectionCard title="Player Bans" borderColor={borderColor} contentBg={contentBg} textPrimary={textPrimary}>
      <ServerRunningWarning serverStatus={serverStatus} />
      {loading && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div>}
      <ErrorMsg error={error} />
      {canWriteNow && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <input type="text" className={`${inputCls} flex-1`} placeholder="Player name" value={banName}
              onChange={(e) => setBanName(e.target.value)} maxLength={16} />
            <input type="text" className={`${inputCls} flex-1`} placeholder="Reason (optional)" value={banReason}
              onChange={(e) => setBanReason(e.target.value)} maxLength={512} />
            <AppButton
              tone="critical"
              onClick={handleBan}
              disabled={banning || !validateMcName(banName)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm flex-shrink-0"
            >
              {banning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Ban
            </AppButton>
          </div>
        </div>
      )}
      {!loading && bans.length === 0 && !error && (
        <p className={`text-sm ${textSecondary}`}>No player bans.</p>
      )}
      {bans.length > 0 && (
        <div className="space-y-2">
          {bans.map((ban) => (
            <div key={ban.name} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${borderColor} bg-gray-900/30`}>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${textPrimary}`}>{ban.name}</p>
                {ban.reason && <p className={`text-xs ${textSecondary} truncate`}>Reason: {ban.reason}</p>}
                {ban.created && <p className={`text-xs ${textSecondary}`}>{new Date(ban.created).toLocaleString()}</p>}
              </div>
              {canWriteNow && (
                <AppButton
                  tone="ghost"
                  onClick={() => handleUnban(ban.name)}
                  disabled={unbanningName === ban.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs flex-shrink-0 border border-gray-600"
                >
                  {unbanningName === ban.name ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Pardon
                </AppButton>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── IP Bans Section ────────────────────────────────────────────────────────

function IpBansSection({
  serverId, serverStatus, canRead, canWrite, isActive, borderColor, contentBg, textPrimary, textSecondary,
}: {
  serverId: number; serverStatus?: string | null; canRead: boolean; canWrite: boolean; isActive: boolean;
  borderColor: string; contentBg: string; textPrimary: string; textSecondary: string;
}) {
  const [bans, setBans] = useState<IpBan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const [unbanningIp, setUnbanningIp] = useState<string | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getMinecraftIpBans(serverId);
      setBans(data.bans);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load IP bans.');
    } finally {
      setLoading(false);
    }
  }, [serverId, canRead]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { void load(); }, []); // eslint-disable-line
  const firstActiveRef = useRef(true);
  useEffect(() => {
    if (firstActiveRef.current) { firstActiveRef.current = false; return; }
    if (isActive) void loadRef.current();
  }, [isActive]);

  const handleBan = async () => {
    const target = banTarget.trim();
    if (!canWrite || !target || banning) return;
    setBanning(true);
    setError(null);
    try {
      await apiClient.banMinecraftIp(serverId, target, banReason.trim() || undefined);
      setBanTarget('');
      setBanReason('');
      setTimeout(() => void load(), 600);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to ban IP.');
    } finally {
      setBanning(false);
    }
  };

  const handleUnban = async (ip: string) => {
    if (!canWrite || unbanningIp) return;
    setUnbanningIp(ip);
    setError(null);
    try {
      await apiClient.unbanMinecraftIp(serverId, ip);
      setTimeout(() => void load(), 600);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to unban IP.');
    } finally {
      setUnbanningIp(null);
    }
  };

  const inputCls = `bg-gp-surface-input border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-cyan-400)]`;
  const canWriteNow = canWrite && serverStatus === 'running';

  return (
    <SectionCard title="IP Bans" borderColor={borderColor} contentBg={contentBg} textPrimary={textPrimary}>
      <ServerRunningWarning serverStatus={serverStatus} />
      {loading && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div>}
      <ErrorMsg error={error} />
      {canWriteNow && (
        <div className="flex items-center gap-2 pt-1">
          <input type="text" className={`${inputCls} flex-1`} placeholder="IP address or player name"
            value={banTarget} onChange={(e) => setBanTarget(e.target.value)} />
          <input type="text" className={`${inputCls} flex-1`} placeholder="Reason (optional)"
            value={banReason} onChange={(e) => setBanReason(e.target.value)} maxLength={512} />
          <AppButton
            tone="critical"
            onClick={handleBan}
            disabled={banning || !banTarget.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm flex-shrink-0"
          >
            {banning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Ban
          </AppButton>
        </div>
      )}
      {!loading && bans.length === 0 && !error && (
        <p className={`text-sm ${textSecondary}`}>No IP bans.</p>
      )}
      {bans.length > 0 && (
        <div className="space-y-2">
          {bans.map((ban) => (
            <div key={ban.ip} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${borderColor} bg-gray-900/30`}>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${textPrimary} font-mono`}>{ban.ip}</p>
                {ban.reason && <p className={`text-xs ${textSecondary} truncate`}>Reason: {ban.reason}</p>}
                {ban.created && <p className={`text-xs ${textSecondary}`}>{new Date(ban.created).toLocaleString()}</p>}
              </div>
              {canWriteNow && (
                <AppButton
                  tone="ghost"
                  onClick={() => handleUnban(ban.ip)}
                  disabled={unbanningIp === ban.ip}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs flex-shrink-0 border border-gray-600"
                >
                  {unbanningIp === ban.ip ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Pardon
                </AppButton>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── ServerVersionSection ───────────────────────────────────────────────────

function ServerVersionSection({
  serverId, mcServerType, canEdit, borderColor, contentBg, textPrimary, serverStatus, containerConfigSaveCount,
}: {
  serverId: number;
  mcServerType: McServerType;
  canEdit: boolean;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
  textSecondary: string;
  serverStatus?: string | null;
  containerConfigSaveCount?: number;
}) {
  const [serverEnv, setServerEnv] = useState<Record<string, string> | null>(null);
  const [envLoading, setEnvLoading] = useState(true);
  const [pickerEnv, setPickerEnv] = useState<Record<string, string>>({});
  const baselineEnvRef = useRef<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handlePickerChange = (env: Record<string, string>) => {
    if (baselineEnvRef.current === null && Object.keys(env).length > 0) {
      baselineEnvRef.current = env;
    }
    setPickerEnv(env);
  };

  useEffect(() => {
    let cancelled = false;
    baselineEnvRef.current = null;
    setEnvLoading(true);
    apiClient.getServer(serverId).then((server: any) => {
      if (cancelled) return;
      // Handle env as object, array, or string.
      const rawEnv = server?.env ?? server?.env_json ?? {};
      const parsed: Record<string, string> = {};
      const fromArray = (arr: unknown[]) => {
        for (const item of arr) {
          if (typeof item !== 'string') continue;
          const idx = item.indexOf('=');
          if (idx >= 0) parsed[item.slice(0, idx)] = item.slice(idx + 1);
        }
      };
      if (typeof rawEnv === 'string') {
        try {
          const decoded = JSON.parse(rawEnv);
          if (Array.isArray(decoded)) fromArray(decoded);
          else if (decoded && typeof decoded === 'object') Object.assign(parsed, decoded);
        } catch { /* use empty */ }
      } else if (Array.isArray(rawEnv)) {
        fromArray(rawEnv);
      } else if (typeof rawEnv === 'object' && rawEnv !== null) {
        Object.assign(parsed, rawEnv as Record<string, string>);
      }
      setServerEnv(parsed);
    }).catch(() => {
      if (!cancelled) setServerEnv({});
    }).finally(() => {
      if (!cancelled) setEnvLoading(false);
    });
    return () => { cancelled = true; };
  }, [serverId, containerConfigSaveCount]);

  const managedKeys = getPickerManagedKeys(mcServerType);
  const initialEnv = serverEnv ?? {};

  const isDirty = baselineEnvRef.current !== null && managedKeys.some(
    (k) => (pickerEnv[k] ?? '') !== (baselineEnvRef.current![k] ?? '')
  );

  const diffLines: string[] = [];
  if (isDirty && serverEnv) {
    for (const key of managedKeys) {
      const oldVal = serverEnv[key] ?? '';
      const newVal = pickerEnv[key] ?? '';
      if (newVal && oldVal !== newVal) {
        diffLines.push(`${key}: ${oldVal || '(not set)'} → ${newVal}`);
      }
    }
  }

  const isRunning = serverStatus === 'running';

  const handleSave = async () => {
    if (!canEdit || !serverEnv) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const newEnv = { ...serverEnv, ...pickerEnv };
      await apiClient.updateServer(serverId, { env: newEnv });
      setServerEnv(newEnv);
      if (isRunning) {
        await apiClient.restartServer(serverId);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || err?.message || 'Failed to save version.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${contentBg} border ${borderColor} rounded-lg p-4 mb-5`}>
      <h4 className={`text-base font-semibold ${textPrimary} mb-3`}>
        Server Version
      </h4>

      {envLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading current version…
        </div>
      ) : (
        <div className="space-y-3">
          <MinecraftVersionPicker
            serverType={mcServerType}
            initialEnv={initialEnv}
            canEdit={canEdit}
            onEnvChange={handlePickerChange}
          />

          {saveSuccess && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <Check className="w-4 h-4" />
              {isRunning ? 'Version saved. Server is restarting…' : 'Version saved.'}
            </div>
          )}

          {saveError && <p className="text-sm text-red-400">{saveError}</p>}

          {canEdit && (
            <div className="flex justify-end">
              <AppButton
                tone="primary"
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Saving…' : isRunning ? 'Save & Restart' : 'Save'}
              </AppButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MinecraftSections (embeddable, horizontal sub-tabs) ───────────────────

type MinecraftSubTab = 'settings' | 'operators' | 'whitelist' | 'bans' | 'ipbans' | 'addons';

export function MinecraftSections({
  serverId,
  serverStatus,
  canReadSettings,
  canWriteSettings,
  advancedLinksNode,
  canReadOperators,
  canWriteOperators,
  canReadWhitelist,
  canWriteWhitelist,
  canReadBans,
  canWriteBans,
  canReadIpBans,
  canWriteIpBans,
  canReadAddons,
  canWriteAddons,
  addonKind,
  borderColor,
  contentBg,
  textPrimary,
  textSecondary,
  mcServerType,
  canEditVersion = false,
  canManageEnv = false,
  containerConfigSaveCount,
}: MinecraftSectionsProps) {
  const addonLabel = addonKind === 'plugins' ? 'Plugins' : 'Mods';

  // The version picker is env-backed, so it needs `server.env`.
  const canShowVersion = !!mcServerType && canManageEnv;

  const tabs: { id: MinecraftSubTab; label: string }[] = [
    (canReadSettings || canShowVersion) && { id: 'settings', label: 'Server Settings' },
    canReadAddons     && { id: 'addons',     label: addonLabel },
    canReadOperators  && { id: 'operators',  label: 'Operators' },
    canReadWhitelist  && { id: 'whitelist',  label: 'Whitelist' },
    canReadBans       && { id: 'bans',       label: 'Player Bans' },
    canReadIpBans     && { id: 'ipbans',     label: 'IP Bans' },
  ].filter(Boolean) as { id: MinecraftSubTab; label: string }[];

  const firstTab = tabs[0]?.id ?? 'settings';
  const [activeTab, setActiveTab] = useState<MinecraftSubTab>(firstTab);
  const [visited, setVisited] = useState<Set<MinecraftSubTab>>(() => new Set([firstTab]));

  const switchTab = (id: MinecraftSubTab) => {
    setActiveTab(id);
    setVisited((prev) => new Set([...prev, id]));
  };

  const sectionProps = { serverId, serverStatus, borderColor, contentBg, textPrimary, textSecondary };

  return (
    <div>
      {/* Horizontal tab bar */}
      <div className={`flex flex-wrap border-b ${borderColor} mb-5 gap-0`}>
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

      {/* Section panels — mounted on first visit, then kept in DOM (hidden) */}
      {visited.has('settings') && (canReadSettings || canShowVersion) && (
        <div className={`space-y-4 ${activeTab !== 'settings' ? 'hidden' : ''}`}>
          {canReadSettings && (
            <GameSettingsSection
              {...sectionProps}
              canRead={canReadSettings}
              canWrite={canWriteSettings}
              load={(id) => apiClient.getMinecraftSettings(id)}
              save={(id, changed) => apiClient.patchMinecraftSettings(id, changed)}
            />
          )}
          {canShowVersion && (
            <ServerVersionSection
              serverId={serverId}
              mcServerType={mcServerType}
              canEdit={canEditVersion}
              borderColor={borderColor}
              contentBg={contentBg}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              serverStatus={serverStatus}
              containerConfigSaveCount={containerConfigSaveCount}
            />
          )}
          {canReadSettings && advancedLinksNode}
        </div>
      )}
      {visited.has('operators') && canReadOperators && (
        <div className={activeTab !== 'operators' ? 'hidden' : ''}>
          <OperatorsSection {...sectionProps} canRead={canReadOperators} canWrite={canWriteOperators} isActive={activeTab === 'operators'} />
        </div>
      )}
      {visited.has('whitelist') && canReadWhitelist && (
        <div className={activeTab !== 'whitelist' ? 'hidden' : ''}>
          <WhitelistSection {...sectionProps} canRead={canReadWhitelist} canWrite={canWriteWhitelist} isActive={activeTab === 'whitelist'} />
        </div>
      )}
      {visited.has('bans') && canReadBans && (
        <div className={activeTab !== 'bans' ? 'hidden' : ''}>
          <PlayerBansSection {...sectionProps} canRead={canReadBans} canWrite={canWriteBans} isActive={activeTab === 'bans'} />
        </div>
      )}
      {visited.has('ipbans') && canReadIpBans && (
        <div className={activeTab !== 'ipbans' ? 'hidden' : ''}>
          <IpBansSection {...sectionProps} canRead={canReadIpBans} canWrite={canWriteIpBans} isActive={activeTab === 'ipbans'} />
        </div>
      )}
      {visited.has('addons') && canReadAddons && (
        <div className={activeTab !== 'addons' ? 'hidden' : ''}>
          <ModsSection
            serverId={serverId}
            kind={addonKind}
            apiKind="minecraft"
            canRead={canReadAddons}
            canWrite={canWriteAddons}
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
