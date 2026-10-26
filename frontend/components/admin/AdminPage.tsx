import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  HardDrive,
  MemoryStick,
  Newspaper,
  Palette,
  Play,
  RefreshCw,
  RotateCw,
  Server,
  Settings2,
  Square,
  Users,
} from 'lucide-react';
import { apiClient } from '../../utils/api';
import type { AdminOverview } from '../../utils/api/types';
import type { GameServer, ServerPlayers } from '../../types/gameServer';
import { AppButton, AppCard } from '../../src/ui/components';
import { ConfirmationModal } from '../ConfirmationModal';
import { NewsEditor } from '../NewsPanel';
import { usePanelName } from '../../contexts/BrandingContext';
import type { OverviewServer, PanelTheme } from '../../utils/adminApi';
import { AdminLive } from './AdminLive';
import { AdminMaps } from './AdminMaps';
import { AdminContent } from './AdminContent';
import { AdminB3 } from './AdminB3';
import { AdminActivity } from './AdminActivity';
import { AdminServerCfg } from './AdminServerCfg';
import { AdminBackups } from './AdminBackups';
import { AdminCod4Files } from './AdminCod4Files';
import { ServerPicker, type Cod4Choice } from './shared';

// Admin page (Super Admins): every server at a glance with group actions, what needs attention, FastDL, the host,
// and the panel's own settings. Server status, metrics and players come from the panel's live data (props);
// add-ons (B3, FastDL), host data and alerts from /api/admin/overview.

type Tab = 'overview' | 'live' | 'maps' | 'config' | 'content' | 'b3' | 'backups' | 'cod4files' | 'fastdl' | 'system' | 'activity' | 'panel';
// tabs about one CoD4 server: they share the server choice
const SERVER_TABS: Tab[] = ['live', 'maps', 'config', 'content', 'b3'];
type BulkAction = 'start' | 'stop' | 'restart';

interface AdminPageProps {
  gameServers: GameServer[];
  serversPlayersById: Record<string, ServerPlayers>;
  gameNamesByKey: Record<string, string>;
  handleServerAction: (serverId: string, serverName: string, action: string) => Promise<void>;
  setActiveTab: (tab: string) => void;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'live', label: 'Players & RCON' },
  { id: 'maps', label: 'Maps' },
  { id: 'config', label: 'Server config' },
  { id: 'content', label: 'Mods & maps' },
  { id: 'b3', label: 'B3' },
  { id: 'backups', label: 'Backups' },
  { id: 'cod4files', label: 'CoD4 files' },
  { id: 'fastdl', label: 'FastDL' },
  { id: 'system', label: 'System' },
  { id: 'activity', label: 'Activity' },
  { id: 'panel', label: 'Panel' },
];

const GB = 1024 ** 3;
const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '–';
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
};
const formatUptime = (seconds: number): string => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
};
const percent = (value: number | undefined) => (value === undefined ? '–' : `${value.toFixed(0)}%`);
const errorText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'running'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : ['starting', 'restarting', 'stopping', 'installing', 'creating'].includes(status)
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-red-500/40 bg-red-500/10 text-red-300';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

function Bar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
      <div className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: v >= 90 ? '#ef4444' : v >= 75 ? '#f59e0b' : '#10b981' }} />
    </div>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: React.ReactNode }) {
  return (
    <AppCard className="p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {sub && <div className="mt-2 text-xs text-gray-400">{sub}</div>}
    </AppCard>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => undefined);
      }}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors ${
        copied ? 'border-emerald-500/50 text-emerald-300' : 'border-gray-600 text-gray-200 hover:border-[var(--color-cyan-400)] hover:text-[var(--color-cyan-400)]'
      }`}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function AdminPage({ gameServers, serversPlayersById, gameNamesByKey, handleServerAction, setActiveTab }: AdminPageProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<(Omit<AdminOverview, 'servers'> & { servers: OverviewServer[] }) | null>(null);
  const [serverId, setServerId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [countingSizes, setCountingSizes] = useState(false);

  const load = useCallback(async (sizes = false) => {
    try {
      const data = (await apiClient.getAdminOverview(sizes)) as Omit<AdminOverview, 'servers'> & { servers: OverviewServer[] };
      setOverview((prev) => (sizes || !prev?.system.sizes ? data : { ...data, system: { ...data.system, sizes: prev.system.sizes } }));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e, 'Could not load the admin overview.'));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const addons = useMemo(() => new Map((overview?.servers ?? []).map((s) => [String(s.id), s])), [overview]);
  // every server the backend knows, with the live data (status, CPU, RAM, port) where the panel has it
  const rows: GameServer[] = useMemo(() => {
    const live = new Map(gameServers.map((s) => [s.id, s]));
    const fromBackend = (overview?.servers ?? []).map(
      (s): GameServer =>
        live.get(String(s.id)) ?? { id: String(s.id), name: s.name, game: s.catalogId ?? '', catalogId: s.catalogId ?? undefined, status: s.status as GameServer['status'] }
    );
    const known = new Set(fromBackend.map((s) => s.id));
    return [...fromBackend, ...gameServers.filter((s) => !known.has(s.id))].sort((a, b) => Number(a.id) - Number(b.id));
  }, [gameServers, overview]);
  // players: the panel's live data, or what the backend read from the CoD4 server itself
  const playersOf = useCallback(
    (id: string) => {
      const p = serversPlayersById[id];
      if (p && p.online !== null) return { online: p.online, max: p.max };
      const own = addons.get(id)?.players;
      return own ? { online: own.online, max: own.max } : null;
    },
    [serversPlayersById, addons]
  );
  const totals = useMemo(() => {
    const running = rows.filter((s) => s.status === 'running').length;
    const players = rows.reduce((sum, s) => sum + (playersOf(s.id)?.online ?? 0), 0);
    return { running, players };
  }, [rows, playersOf]);
  const cod4Servers: Cod4Choice[] = useMemo(
    () => (overview?.servers ?? []).filter((s) => s.catalogId === 'cod4').map((s) => ({ id: String(s.id), name: s.name, status: s.status })),
    [overview]
  );
  useEffect(() => {
    if (!serverId && cod4Servers.length > 0) setServerId(cod4Servers[0].id);
  }, [cod4Servers, serverId]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = rows.length > 0 && rows.every((s) => selected.has(s.id));

  const runBulk = async () => {
    if (!bulk) return;
    const targets = rows.filter((s) => selected.has(s.id));
    for (const server of targets) {
      await handleServerAction(server.id, server.name, bulk);
    }
    setMessage({ ok: true, text: `${bulk[0].toUpperCase()}${bulk.slice(1)} sent to ${targets.length} server(s).` });
    setSelected(new Set());
    window.setTimeout(() => void load(), 3000);
  };

  const syncAll = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await apiClient.syncAllFastDl();
      setMessage({ ok: true, text: `FastDL synced: ${result.total} files, ${result.added} new or changed, ${result.removed} removed.` });
      await load();
    } catch (e) {
      setMessage({ ok: false, text: errorText(e, 'FastDL sync failed.') });
    } finally {
      setSyncing(false);
    }
  };

  const system = overview?.system;
  const fastdl = overview?.fastdl;
  const diskPct = system?.disk && system.disk.total > 0 ? (system.disk.used / system.disk.total) * 100 : 0;
  const memPct = system ? ((system.memory.total - system.memory.free) / system.memory.total) * 100 : 0;
  const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-400';
  const td = 'px-3 py-2 text-sm text-gray-200';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Admin</h1>
        <AppButton tone="ghost" onClick={() => void load()}>
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </span>
        </AppButton>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setMessage(null);
            }}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.id
                ? 'border-[var(--color-cyan-400)] bg-[var(--color-cyan-400)]/15 text-[var(--color-cyan-400)]'
                : 'border-gray-700 text-gray-300 hover:border-[var(--color-cyan-400)]/60 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4" /> {loadError}
        </div>
      )}
      {message && (
        <div className={`rounded-lg border p-3 text-sm ${message.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
          {message.text}
        </div>
      )}

      {tab === 'overview' && (
        <>
          <AppCard className="p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Needs attention</h2>
            {!overview ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : overview.alerts.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Everything is fine.
              </p>
            ) : (
              <ul className="space-y-2">
                {overview.alerts.map((a, i) => (
                  <li key={i} className={`flex items-start gap-2 text-sm ${a.level === 'error' ? 'text-red-300' : 'text-amber-300'}`}>
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {a.text}
                  </li>
                ))}
              </ul>
            )}
          </AppCard>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile icon={<Server className="h-4 w-4" />} label="Servers" value={`${totals.running} / ${rows.length}`} sub="running" />
            <Tile icon={<Users className="h-4 w-4" />} label="Players" value={String(totals.players)} sub="online now" />
            <Tile
              icon={<MemoryStick className="h-4 w-4" />}
              label="Memory"
              value={system ? `${memPct.toFixed(0)}%` : '–'}
              sub={system && <><Bar value={memPct} /><span className="mt-1 block">{formatBytes(system.memory.total - system.memory.free)} of {formatBytes(system.memory.total)}</span></>}
            />
            <Tile
              icon={<HardDrive className="h-4 w-4" />}
              label="Disk"
              value={system?.disk ? `${diskPct.toFixed(0)}%` : '–'}
              sub={system?.disk && <><Bar value={diskPct} /><span className="mt-1 block">{formatBytes(system.disk.free)} free of {formatBytes(system.disk.total)}</span></>}
            />
          </div>

          <AppCard className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-700 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Game servers</h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-400">{selected.size} selected</span>
                <AppButton tone="ghost" disabled={selected.size === 0} onClick={() => setBulk('start')}>
                  <span className="inline-flex items-center gap-1.5 text-green-400"><Play className="h-4 w-4" /> Start</span>
                </AppButton>
                <AppButton tone="ghost" disabled={selected.size === 0} onClick={() => setBulk('restart')}>
                  <span className="inline-flex items-center gap-1.5 text-orange-400"><RotateCw className="h-4 w-4" /> Restart</span>
                </AppButton>
                <AppButton tone="ghost" disabled={selected.size === 0} onClick={() => setBulk('stop')}>
                  <span className="inline-flex items-center gap-1.5 text-red-400"><Square className="h-4 w-4" /> Stop</span>
                </AppButton>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className={th}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((s) => s.id)))}
                        aria-label="Select all servers"
                      />
                    </th>
                    <th className={th}>Server</th>
                    <th className={th}>Status</th>
                    <th className={th}>Players</th>
                    <th className={th}>CPU</th>
                    <th className={th}>RAM</th>
                    <th className={th}>Port</th>
                    <th className={th}>B3</th>
                    <th className={th}>FastDL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td className={td} colSpan={9}>No servers yet.</td>
                    </tr>
                  )}
                  {rows.map((s) => {
                    const extra = addons.get(s.id);
                    const players = playersOf(s.id);
                    return (
                      <tr key={s.id} className="border-b border-gray-800 last:border-0 hover:bg-white/5">
                        <td className={td}>
                          <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.name}`} />
                        </td>
                        <td className={td}>
                          {s.catalogId === 'cod4' ? (
                            <button
                              type="button"
                              className="font-semibold text-white hover:text-[var(--color-cyan-400)] hover:underline"
                              title="Players & RCON"
                              onClick={() => {
                                setServerId(s.id);
                                setTab('live');
                              }}
                            >
                              {s.name}
                            </button>
                          ) : (
                            <div className="font-semibold text-white">{s.name}</div>
                          )}
                          <div className="text-xs text-gray-400">#{s.id} · {gameNamesByKey[s.catalogId ?? ''] ?? s.game}</div>
                        </td>
                        <td className={td}><StatusBadge status={s.status} /></td>
                        <td className={td}>{players?.online !== null && players?.online !== undefined ? `${players.online}${players.max ? ` / ${players.max}` : ''}` : '–'}</td>
                        <td className={td}>{percent(s.cpuUsage)}</td>
                        <td className={td}>{percent(s.memoryUsage)}</td>
                        <td className={`${td} font-mono`}>{s.port ?? '–'}</td>
                        <td className={td}>
                          {extra?.b3 ? (
                            <span className={extra.b3.state === 'running' ? 'text-emerald-300' : extra.b3.wanted ? 'text-red-300' : 'text-gray-400'}>{extra.b3.state}</span>
                          ) : (
                            <span className="text-gray-500">–</span>
                          )}
                        </td>
                        <td className={td}>
                          {extra?.fastdl === null || extra?.fastdl === undefined ? (
                            <span className="text-gray-500">–</span>
                          ) : extra.fastdl ? (
                            <span className="text-emerald-300">on</span>
                          ) : (
                            <span className="text-gray-400">off</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </AppCard>
        </>
      )}

      {tab === 'fastdl' && (
        <AppCard className="p-5">
          {!fastdl ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !fastdl.installed ? (
            <p className="text-sm text-gray-300">FastDL is not installed. On the panel server: <code>bash gp-fastdl.sh</code></p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className={fastdl.running ? 'text-emerald-300' : 'text-red-300'}>{fastdl.running ? '● web server running' : '● web server not running'}</span>
                <span className={fastdl.serviceAlive ? 'text-emerald-300' : 'text-amber-300'}>{fastdl.serviceAlive ? '● sync service running' : '● sync service not running'}</span>
                <span className="text-gray-400">{fastdl.lastSync ? `last sync ${new Date(fastdl.lastSync).toLocaleTimeString()}` : ''}</span>
                <AppButton tone="ghost" onClick={() => void syncAll()} disabled={syncing}>
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync all'}
                  </span>
                </AppButton>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className={th}>Server</th>
                      <th className={th}>Link (game)</th>
                      <th className={th}>Files</th>
                      <th className={th}>On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.servers ?? [])
                      .filter((s) => s.catalogId === 'cod4')
                      .map((s) => {
                        const link = `${fastdl.url}/${s.id}`;
                        return (
                          <tr key={s.id} className="border-b border-gray-800 last:border-0">
                            <td className={td}><span className="font-semibold text-white">{s.name}</span> <span className="text-xs text-gray-400">#{s.id}</span></td>
                            <td className={td}>
                              <span className="inline-flex items-center gap-2">
                                <code className="text-xs">{link}</code>
                                <CopyButton text={link} />
                              </span>
                            </td>
                            <td className={td}>{fastdl.published?.[String(s.id)] ?? 0}</td>
                            <td className={td}>{s.fastdl ? <span className="text-emerald-300">on</span> : <span className="text-gray-400">off (Command line card)</span>}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {fastdl.browserUrl && (
                <p className="text-xs text-gray-400">
                  In a browser also: <code>{fastdl.browserUrl}/&lt;server&gt;/mods/&lt;mod&gt;/mod.ff</code>. Folders give 403.
                </p>
              )}
            </div>
          )}
        </AppCard>
      )}

      {tab === 'system' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile icon={<Server className="h-4 w-4" />} label="Host" value={system?.hostname ?? '–'} sub={system ? `up ${formatUptime(system.uptime)}` : undefined} />
            <Tile icon={<Cpu className="h-4 w-4" />} label="Load" value={system ? system.load[0].toFixed(2) : '–'} sub={system ? `${system.load.map((l) => l.toFixed(2)).join(' / ')} · ${system.cpus} CPUs` : undefined} />
            <Tile
              icon={<MemoryStick className="h-4 w-4" />}
              label="Memory"
              value={system ? formatBytes(system.memory.total - system.memory.free) : '–'}
              sub={system && <><Bar value={memPct} /><span className="mt-1 block">of {formatBytes(system.memory.total)}</span></>}
            />
            <Tile
              icon={<HardDrive className="h-4 w-4" />}
              label="Disk"
              value={system?.disk ? formatBytes(system.disk.used) : '–'}
              sub={system?.disk && <><Bar value={diskPct} /><span className="mt-1 block">of {formatBytes(system.disk.total)}</span></>}
            />
          </div>

          <AppCard className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Disk use by folder</h2>
              <AppButton
                tone="ghost"
                disabled={countingSizes}
                onClick={() => {
                  setCountingSizes(true);
                  void load(true).finally(() => setCountingSizes(false));
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <HardDrive className="h-4 w-4" /> {countingSizes ? 'Counting…' : system?.sizes ? 'Count again' : 'Count'}
                </span>
              </AppButton>
            </div>
            {system?.sizes ? (
              <table className="w-full">
                <tbody>
                  <tr className="border-b border-gray-800">
                    <td className={td}>cod4-linux (shared CoD4 files)</td>
                    <td className={`${td} text-right`}>{formatBytes(system.sizes['cod4-linux'])}</td>
                  </tr>
                  {(overview?.servers ?? []).map((s) => (
                    <tr key={s.id} className="border-b border-gray-800 last:border-0">
                      <td className={td}>{s.name} <span className="text-xs text-gray-400">#{s.id}</span></td>
                      <td className={`${td} text-right`}>{formatBytes(system.sizes?.[String(s.id)])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400">Counts each server's own files (shared CoD4 files once). Takes a few seconds.</p>
            )}
          </AppCard>

          <AppCard className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Panel containers</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className={th}>Name</th>
                    <th className={th}>Image</th>
                    <th className={th}>State</th>
                  </tr>
                </thead>
                <tbody>
                  {(system?.containers ?? []).map((c) => (
                    <tr key={c.name} className="border-b border-gray-800 last:border-0">
                      <td className={`${td} font-mono`}>{c.name}</td>
                      <td className={`${td} text-xs text-gray-400`}>{c.image}</td>
                      <td className={td}>
                        <span className={c.state === 'running' ? 'text-emerald-300' : 'text-red-300'}>{c.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AppCard>
        </div>
      )}

      {SERVER_TABS.includes(tab) && <ServerPicker servers={cod4Servers} value={serverId} onChange={setServerId} />}
      {tab === 'live' && serverId && <AdminLive serverId={serverId} />}
      {tab === 'maps' && serverId && <AdminMaps serverId={serverId} />}
      {tab === 'content' && serverId && <AdminContent serverId={serverId} servers={cod4Servers} />}
      {tab === 'b3' && serverId && <AdminB3 serverId={serverId} b3State={addons.get(serverId)?.b3?.state ?? null} />}
      {tab === 'config' && serverId && <AdminServerCfg serverId={serverId} />}
      {tab === 'backups' && <AdminBackups servers={cod4Servers} serverId={serverId} onServer={setServerId} />}
      {tab === 'cod4files' && <AdminCod4Files />}
      {tab === 'activity' && <AdminActivity />}
      {tab === 'panel' && <PanelSettings setActiveTab={setActiveTab} />}

      <ConfirmationModal
        isOpen={bulk !== null}
        onClose={() => setBulk(null)}
        onConfirm={runBulk}
        title={bulk ? `${bulk[0].toUpperCase()}${bulk.slice(1)} servers` : ''}
        message={`${bulk ?? ''} ${selected.size} server(s): ${rows.filter((s) => selected.has(s.id)).map((s) => s.name).join(', ')}?`}
        confirmText={bulk ? `${bulk[0].toUpperCase()}${bulk.slice(1)}` : 'OK'}
        confirmButtonClass={bulk === 'stop' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}
      />
    </div>
  );
}

function PanelSettings({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const { name, saveName, defaultTheme, loginFooter, setAppearance } = usePanelName();
  const [themeDraft, setThemeDraft] = useState<PanelTheme>(defaultTheme);
  const [footerDraft, setFooterDraft] = useState(loginFooter);
  const [lookResult, setLookResult] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setThemeDraft(defaultTheme), [defaultTheme]);
  useEffect(() => setFooterDraft(loginFooter), [loginFooter]);
  const [draft, setDraft] = useState(name ?? '');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [newsItems, setNewsItems] = useState<import('../../utils/api').CatalogNewsItem[] | null>(null);
  const [editingNews, setEditingNews] = useState(false);

  useEffect(() => setDraft(name ?? ''), [name]);

  const save = async (value: string) => {
    setSaving(true);
    setResult(null);
    try {
      await saveName(value);
      setResult({ ok: true, text: value.trim() ? 'Panel name saved.' : 'The OVHcloud logo is back.' });
    } catch (e) {
      setResult({ ok: false, text: errorText(e, 'Could not save the panel name.') });
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full max-w-md rounded-lg border border-gray-600 bg-[#0b1324] px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-cyan-400)]';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AppCard className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
          <Settings2 className="h-4 w-4" /> Panel name
        </h2>
        <p className="mb-3 text-sm text-gray-400">Shown instead of the OVHcloud Game Panel logo: sidebar, login page, browser tab.</p>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} placeholder="OVHcloud Game Panel" className={field} />
        <div className="mt-3 flex flex-wrap gap-2">
          <AppButton tone="primary" disabled={saving} onClick={() => void save(draft)}>
            {saving ? 'Saving…' : 'Save'}
          </AppButton>
          <AppButton tone="ghost" disabled={saving} onClick={() => void save('')}>
            Use the logo
          </AppButton>
        </div>
        {result && <p className={`mt-2 text-sm ${result.ok ? 'text-emerald-300' : 'text-red-300'}`}>{result.text}</p>}
      </AppCard>

      <AppCard className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
          <Palette className="h-4 w-4" /> Look
        </h2>
        <p className="mb-3 text-sm text-gray-400">The theme of visitors who have not picked one yet (login page too), and the line under the login form.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ['orange', 'Neon orange'],
              ['cyan', 'Neon cyan'],
              ['dark', 'Dark'],
              ['light', 'Light'],
            ] as Array<[PanelTheme, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setThemeDraft(id)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                themeDraft === id
                  ? 'border-[var(--color-cyan-400)] bg-[var(--color-cyan-400)]/15 text-[var(--color-cyan-400)]'
                  : 'border-gray-700 text-gray-300 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={footerDraft}
          onChange={(e) => setFooterDraft(e.target.value)}
          maxLength={200}
          placeholder="Login page footer (empty = none), e.g. © 2026 My Clan"
          className={field}
        />
        <div className="mt-3">
          <AppButton
            tone="primary"
            onClick={() => {
              setLookResult(null);
              setAppearance({ defaultTheme: themeDraft, loginFooter: footerDraft })
                .then(() => setLookResult({ ok: true, text: 'Saved. Your own theme choice (sidebar buttons) stays as it is.' }))
                .catch((e) => setLookResult({ ok: false, text: errorText(e, 'Could not save.') }));
            }}
          >
            Save
          </AppButton>
        </div>
        {lookResult && <p className={`mt-2 text-sm ${lookResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>{lookResult.text}</p>}
      </AppCard>

      <AppCard className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
          <Newspaper className="h-4 w-4" /> News
        </h2>
        <p className="mb-3 text-sm text-gray-400">The news bar above the server list. Users see it while there is news.</p>
        <AppButton
          tone="ghost"
          onClick={() => {
            void apiClient
              .getPanelNews()
              .then((res) => setNewsItems(res.news))
              .catch(() => setNewsItems([]))
              .finally(() => setEditingNews(true));
          }}
        >
          <span className="inline-flex items-center gap-2"><Newspaper className="h-4 w-4" /> Edit news</span>
        </AppButton>
        {editingNews && newsItems && (
          <NewsEditor
            items={newsItems}
            onClose={() => setEditingNews(false)}
            onSaved={() => setEditingNews(false)}
          />
        )}
      </AppCard>

      <AppCard className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
          <Users className="h-4 w-4" /> Users and Super Admins
        </h2>
        <p className="mb-3 text-sm text-gray-400">Create users, give them servers and permissions, make them Super Admins.</p>
        <AppButton tone="ghost" onClick={() => setActiveTab('admin-users')}>
          <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> User Administration</span>
        </AppButton>
      </AppCard>

      <AppCard className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
          <Download className="h-4 w-4" /> Updates of the add-ons
        </h2>
        <p className="text-sm text-gray-400">
          On the panel server: <code>bash gp-cod4-linux.sh</code> (panel), <code>bash gp-neon-theme.sh</code> (theme),{' '}
          <code>bash gp-fastdl.sh</code> (FastDL), <code>bash gp-b3.sh</code> (B3).
        </p>
      </AppCard>
    </div>
  );
}
