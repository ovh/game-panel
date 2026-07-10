import React, { useEffect, useState } from 'react';
import { useBodyScrollLock } from '../src/ui/utils/useBodyScrollLock';
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, Eye, EyeOff, Info, Package, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import { InstallationProgressModal } from './InstallationProgressModal';
import type { InstallGameHandlerPayload } from './app/appActionHandlers';
import type { InstallInteraction, InstallStep } from '../types/gameServer';
import { type OvhcloudImage } from '../utils/ovhcloudCatalog';
import { OVH_UNIFIED, filterLgsmForUnified } from '../utils/unifiedGameCatalog';
import { getLinuxGsmGames, type LinuxGsmGame } from '../utils/linuxGsmCatalog';
import { apiClient } from '../utils/api';
import { GameVersionModal } from './GameVersionModal';
import { AppButton, AppToggle } from '../src/ui/components';
import { ProviderLogo } from './gameServersTable/ProviderBadge';
import { MinecraftVersionPicker } from './MinecraftVersionPicker';
import { getMcServerType, getPickerManagedKeys, type McServerType } from '../utils/minecraftCatalog';

interface PortRow { host: string; container: string; label: string }
interface EnvRow { key: string; value: string }
interface MountRow { key: string; containerPath: string }

interface InstallGameServerProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: (payload: InstallGameHandlerPayload) => Promise<void>;
  installing?: boolean;
  installError?: string | null;
  installProgressPercent?: number | null;
  installStatus?: string | null;
  installServerId?: number | null;
  installInteraction?: InstallInteraction | null;
  setInstallInteraction?: (v: InstallInteraction | null) => void;
  installPlan?: InstallStep[];
  installPermissionsSyncing?: boolean;
  canOpenInstallLog?: boolean;
  usedPorts?: { tcp: number[]; udp: number[] };
  usedServerNames?: string[];
  canInstall?: boolean;
  onClearError?: () => void;
  onOpenConsole?: (serverId: number) => void;
  onReopen?: () => void;
}

function findAvailablePort(preferred: number, usedSet: Set<number>): number {
  let port = preferred;
  while (usedSet.has(port) && port < 65535) port++;
  return port;
}

function portsFromImage(
  image: OvhcloudImage,
  usedPorts?: { tcp: number[]; udp: number[] },
): { tcp: PortRow[]; udp: PortRow[] } {
  const usedTcp = new Set(usedPorts?.tcp ?? []);
  const usedUdp = new Set(usedPorts?.udp ?? []);
  const allocatedTcp = new Set<number>();
  const allocatedUdp = new Set<number>();

  const tcp = image.defaultTcpPorts.map((p) => {
    const port = findAvailablePort(p.port, new Set([...usedTcp, ...allocatedTcp]));
    allocatedTcp.add(port);
    return { host: String(port), container: String(p.port), label: p.label };
  });
  const udp = image.defaultUdpPorts.map((p) => {
    const port = findAvailablePort(p.port, new Set([...usedUdp, ...allocatedUdp]));
    allocatedUdp.add(port);
    return { host: String(port), container: String(p.port), label: p.label };
  });
  return { tcp, udp };
}

function envFromImage(image: OvhcloudImage): EnvRow[] {
  return Object.entries(image.defaultEnv).map(([key, value]) => ({ key, value }));
}

function parsePortRows(rows: PortRow[]): { host: number; container: number; label: string }[] {
  return rows
    .filter((r) => r.host.trim() && r.container.trim())
    .map((r) => ({ host: Number(r.host), container: Number(r.container), label: r.label.trim() }))
    .filter((r) => r.host > 0 && r.container > 0);
}

// A row with any content but no valid Host/Container port blocks submission; a fully empty row is ignored.
function hasIncompletePortRow(rows: PortRow[]): boolean {
  return rows.some((r) => {
    const hasAnyValue = Boolean(r.host.trim() || r.container.trim() || r.label.trim());
    const hasValidPorts = Number(r.host) > 0 && Number(r.container) > 0;
    return hasAnyValue && !hasValidPorts;
  });
}

function envRowsToRecord(rows: EnvRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]));
}

const inputCls =
  'w-full rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20 focus:border-transparent disabled:opacity-50 transition-all';

// ---------- CollapsibleSection ----------
function CollapsibleSection({
  label, badge, children, defaultOpen = false,
}: {
  label: string; badge?: string | number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
          {badge !== undefined && (
            <span className="text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/8 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700/50 font-medium">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

// ---------- PortSection ----------
function PortSection({ label, rows, setRows }: { label: string; rows: PortRow[]; setRows: (r: PortRow[]) => void }) {
  const update = (i: number, field: keyof PortRow, value: string) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <AppButton
          type="button"
          tone="ghost"
          onClick={() => setRows([...rows, { host: '', container: '', label: '' }])}
          className="flex items-center gap-1 text-xs text-[var(--gp-ods-accent-primary)] dark:text-gray-400 hover:text-[var(--gp-ods-accent-secondary)] dark:hover:text-gray-200 px-2 py-1 rounded"
        >
          <Plus className="w-3 h-3" /> Add
        </AppButton>
      </div>
      {rows.length === 0 && <p className="text-xs text-gray-500 italic">No ports configured.</p>}
      {rows.length > 0 && (
        <div className="flex gap-2 mb-1 items-center">
          <span className="w-20 text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Host port</span>
          <span className="text-xs invisible" aria-hidden>→</span>
          <span className="w-20 text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Container port</span>
          <span className="flex-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</span>
          <span className="p-1 invisible" aria-hidden><Trash2 className="w-3 h-3" /></span>
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 mb-2 items-center">
          <input type="number" placeholder="Host" value={row.host} onChange={(e) => update(i, 'host', e.target.value)}
            className="w-20 rounded-lg bg-gray-50 dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
          <span className="text-gray-400 text-xs">→</span>
          <input type="number" placeholder="Container" value={row.container} onChange={(e) => update(i, 'container', e.target.value)}
            className="w-20 rounded-lg bg-gray-50 dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
          <input type="text" placeholder="Label" value={row.label} onChange={(e) => update(i, 'label', e.target.value)}
            className="flex-1 rounded-lg bg-gray-50 dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
          <AppButton type="button" tone="ghost" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
            className="p-1 text-gray-400 hover:text-red-400 rounded">
            <Trash2 className="w-3 h-3" />
          </AppButton>
        </div>
      ))}
    </div>
  );
}

// ---------- MountSection ----------
function MountSection({ rows, setRows }: { rows: MountRow[]; setRows: (r: MountRow[]) => void }) {
  const update = (i: number, field: keyof MountRow, value: string) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <AppButton
          type="button"
          tone="ghost"
          onClick={() => setRows([...rows, { key: '', containerPath: '' }])}
          className="flex items-center gap-1 text-xs text-[var(--gp-ods-accent-primary)] dark:text-gray-400 hover:text-[var(--gp-ods-accent-secondary)] dark:hover:text-gray-200 px-2 py-1 rounded"
        >
          <Plus className="w-3 h-3" /> Add
        </AppButton>
      </div>
      {rows.length === 0 && <p className="text-xs text-gray-500 italic">No volumes configured.</p>}
      {rows.length > 0 && (
        <div className="flex gap-2 mb-1 items-center">
          <span className="w-28 text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</span>
          <span className="text-xs invisible" aria-hidden>→</span>
          <span className="flex-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Container path</span>
          <span className="p-1 invisible" aria-hidden><Trash2 className="w-3 h-3" /></span>
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 mb-2 items-center">
          <input type="text" placeholder="volume-key" value={row.key}
            onChange={(e) => update(i, 'key', e.target.value)}
            className="w-28 rounded-lg bg-gray-50 dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
          <span className="text-gray-400 text-xs">→</span>
          <input type="text" placeholder="/container/path" value={row.containerPath}
            onChange={(e) => update(i, 'containerPath', e.target.value)}
            className="flex-1 rounded-lg bg-gray-50 dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
          <AppButton type="button" tone="ghost" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
            className="p-1 text-gray-400 hover:text-red-400 rounded">
            <Trash2 className="w-3 h-3" />
          </AppButton>
        </div>
      ))}
    </div>
  );
}

// ---------- HealthcheckEditor ----------
type HCMode = 'default' | 'disabled' | 'override';
type HCType = 'tcp_connect' | 'process' | 'command';
interface HCEdit { mode: HCMode; type: HCType; port: string; processName: string; command: string; interval: string; timeout: string; startPeriod: string; retries: string; }

function initHCEdit(initial: Record<string, unknown> | null): HCEdit {
  const m: HCMode = initial?.mode === 'disabled' ? 'disabled' : initial?.mode === 'override' ? 'override' : 'default';
  return {
    mode: m,
    type: (initial?.type as HCType) ?? 'tcp_connect',
    port: String(initial?.port ?? ''),
    processName: String(initial?.name ?? ''),
    command: Array.isArray(initial?.command)
      ? (initial!.command as unknown[]).join(' ')
      : String(initial?.cmd ?? ''),
    interval: String(initial?.intervalSeconds ?? '10'),
    timeout: String(initial?.timeoutSeconds ?? '5'),
    startPeriod: String(initial?.startPeriodSeconds ?? '30'),
    retries: String(initial?.retries ?? '3'),
  };
}

function buildHC(s: HCEdit): Record<string, unknown> | null {
  if (s.mode === 'default') return null;
  if (s.mode === 'disabled') return { mode: 'disabled' };
  const hc: Record<string, unknown> = { mode: 'override', type: s.type };
  if (s.type === 'tcp_connect' && s.port) hc.port = Number(s.port);
  if (s.type === 'process' && s.processName) hc.name = s.processName;
  if (s.type === 'command' && s.command.trim()) hc.command = s.command.trim().split(/\s+/);
  if (s.interval) hc.intervalSeconds = Number(s.interval);
  if (s.timeout) hc.timeoutSeconds = Number(s.timeout);
  if (s.startPeriod) hc.startPeriodSeconds = Number(s.startPeriod);
  if (s.retries) hc.retries = Number(s.retries);
  return hc;
}

function HealthcheckEditor({ initial, onChange }: { initial: Record<string, unknown> | null; onChange: (hc: Record<string, unknown> | null) => void }) {
  const [state, setState] = React.useState<HCEdit>(() => initHCEdit(initial));
  const fieldCls = "w-full rounded-lg bg-gray-50 dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20";

  const update = (patch: Partial<HCEdit>) => {
    const next = { ...state, ...patch };
    setState(next);
    onChange(buildHC(next));
  };

  const modes: { value: HCMode; label: string }[] = [
    { value: 'default', label: 'Image Default' },
    { value: 'disabled', label: 'Disable' },
    { value: 'override', label: 'Override' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700/50 w-fit">
        {modes.map((m, i) => (
          <button key={m.value} type="button" onClick={() => update({ mode: m.value })}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${i > 0 ? 'border-l border-gray-200 dark:border-gray-700/50' : ''} ${
              state.mode === m.value
                ? 'bg-[var(--gp-ods-accent-primary)] text-white [--gp-text-white:#ffffff]'
                : 'bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            {m.label}
          </button>
        ))}
      </div>

      {state.mode === 'override' && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type</label>
            <select value={state.type} onChange={e => update({ type: e.target.value as HCType })} className={fieldCls}>
              <option value="tcp_connect">TCP Connect</option>
              <option value="process">Process</option>
              <option value="command">Command</option>
            </select>
          </div>
          {state.type === 'tcp_connect' && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Port</label>
              <input type="number" min="1" max="65535" value={state.port} onChange={e => update({ port: e.target.value })} className={fieldCls} placeholder="25565" />
            </div>
          )}
          {state.type === 'process' && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Process name</label>
              <input type="text" value={state.processName} onChange={e => update({ processName: e.target.value })} className={fieldCls} placeholder="server" />
            </div>
          )}
          {state.type === 'command' && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Command</label>
              <input type="text" value={state.command} onChange={e => update({ command: e.target.value })} className={fieldCls} placeholder="CMD healthcheck" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Interval (s)</label>
              <input type="number" min="1" value={state.interval} onChange={e => update({ interval: e.target.value })} className={fieldCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Timeout (s)</label>
              <input type="number" min="1" value={state.timeout} onChange={e => update({ timeout: e.target.value })} className={fieldCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Start period (s)</label>
              <input type="number" min="0" value={state.startPeriod} onChange={e => update({ startPeriod: e.target.value })} className={fieldCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Retries</label>
              <input type="number" min="1" value={state.retries} onChange={e => update({ retries: e.target.value })} className={fieldCls} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- ConfigModal ----------
interface ConfigModalProps {
  title: string;
  subtitle?: string;
  provider?: 'ovhcloud' | 'linuxgsm';
  imageRef?: string;
  serverName: string;
  setServerName: (v: string) => void;
  tcpPorts: PortRow[];
  setTcpPorts: (rows: PortRow[]) => void;
  udpPorts: PortRow[];
  setUdpPorts: (rows: PortRow[]) => void;
  envRows: EnvRow[];
  setEnvRows: (rows: EnvRow[]) => void;
  showEnv: boolean;
  mountRows?: MountRow[];
  setMountRows?: (rows: MountRow[]) => void;
  catalogHealthcheck?: Record<string, unknown> | null;
  onHealthcheckChange?: (hc: Record<string, unknown> | null) => void;
  hytaleOptions?: { patchline: string; profileUuid: string };
  setHytaleOptions?: (opts: { patchline: string; profileUuid: string }) => void;
  showPalworldAdmin?: boolean;
  usedServerNames?: string[];
  requireSteamCredentials?: boolean;
  steamUsername?: string;
  setSteamUsername?: (v: string) => void;
  steamPassword?: string;
  setSteamPassword?: (v: string) => void;
  requireGameCopy?: boolean;
  cpuLimit: string;
  setCpuLimit: (v: string) => void;
  memoryLimitMb: string;
  setMemoryLimitMb: (v: string) => void;
  error: string | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  mcServerType?: McServerType | null;
  pickerInitialEnv?: Record<string, string>;
  onPickerEnvChange?: (env: Record<string, string>) => void;
  requireEula?: boolean;
}

// Generate a strong Palworld admin password (sent as PALWORLD_ADMIN_PASSWORD at install),
// avoiding visually ambiguous characters. If the user clears it, the backend generates one.
function generatePalworldAdminPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function ConfigModal({
  title, subtitle, provider, imageRef, serverName, setServerName, tcpPorts, setTcpPorts, udpPorts, setUdpPorts,
  envRows, setEnvRows, showEnv, mountRows, setMountRows, catalogHealthcheck, onHealthcheckChange,
  hytaleOptions, setHytaleOptions,
  showPalworldAdmin,
  usedServerNames,
  requireSteamCredentials, steamUsername, setSteamUsername, steamPassword, setSteamPassword,
  requireGameCopy,
  cpuLimit, setCpuLimit, memoryLimitMb, setMemoryLimitMb,
  error, loading, onConfirm, onCancel,
  mcServerType, pickerInitialEnv, onPickerEnvChange, requireEula,
}: ConfigModalProps) {
  useBodyScrollLock(true);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [showAdminHelp, setShowAdminHelp] = React.useState(false);
  const [showAdminPw, setShowAdminPw] = React.useState(false);
  const nameError = usedServerNames?.includes(serverName.trim()) ? 'A server with this name already exists.' : null;

  React.useEffect(() => {
    if (error) setAdvancedOpen(true);
  }, [error]);

  // EULA acceptance is backed by the `EULA` env var; the toggle is just an explicit gate,
  // defaulting to unaccepted so acceptance is the user's affirmative act.
  const eulaAccepted = envRows.some(
    (r) => r.key.trim().toUpperCase() === 'EULA' && r.value.trim().toUpperCase() === 'TRUE'
  );
  const setEulaAccepted = (accepted: boolean) => {
    const val = accepted ? 'TRUE' : 'FALSE';
    const idx = envRows.findIndex((r) => r.key.trim().toUpperCase() === 'EULA');
    if (idx >= 0) {
      setEnvRows(envRows.map((r, i) => (i === idx ? { ...r, value: val } : r)));
    } else {
      setEnvRows([{ key: 'EULA', value: val }, ...envRows]);
    }
  };
  const eulaBlocked = !!requireEula && !eulaAccepted;

  // Palworld admin password is backed by the PALWORLD_ADMIN_PASSWORD env var, so the
  // dedicated field and the Environment Variables list stay in sync (like EULA).
  const palworldAdminPassword =
    envRows.find((r) => r.key.trim().toUpperCase() === 'PALWORLD_ADMIN_PASSWORD')?.value ?? '';
  const setPalworldAdminPassword = (val: string) => {
    const idx = envRows.findIndex((r) => r.key.trim().toUpperCase() === 'PALWORLD_ADMIN_PASSWORD');
    if (idx >= 0) {
      setEnvRows(envRows.map((r, i) => (i === idx ? { ...r, value: val } : r)));
    } else {
      setEnvRows([...envRows, { key: 'PALWORLD_ADMIN_PASSWORD', value: val }]);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gradient-to-br dark:from-[#1f2937] dark:to-[#111827] border border-gray-200 dark:border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-700/50">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white inline-flex items-center gap-2.5">
              {title}
              <ProviderLogo provider={provider} height={22} />
            </h3>
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <AppButton tone="ghost" onClick={onCancel}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-100 dark:hover:bg-white/10">
            <X className="w-4 h-4" />
          </AppButton>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Server Name
            </label>
            <input type="text" value={serverName} onChange={(e) => setServerName(e.target.value)}
              placeholder="My Game Server" className={inputCls} />
            {nameError && <p className="mt-1.5 text-xs text-red-400">{nameError}</p>}
          </div>

          {showPalworldAdmin && (
            <div>
              <div className="relative mb-2 flex">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Palworld Admin Password
                  <AppButton
                    tone="ghost"
                    aria-label="About the admin password"
                    aria-expanded={showAdminHelp}
                    onClick={() => setShowAdminHelp((v) => !v)}
                    className="inline-flex h-5 shrink-0 items-center justify-center px-0.5 text-[var(--color-cyan-400)]/80 transition-colors hover:text-[var(--color-cyan-400)]"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </AppButton>
                </span>
                {showAdminHelp && (
                  <div className="absolute left-0 top-full z-20 mt-2 w-[280px] max-w-[calc(100vw-4rem)]">
                    <div className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 border-l border-t border-gray-700/80 bg-gp-surface-input" />
                    <div className="relative rounded-xl border border-gray-700/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(11,18,32,0.98))] px-3.5 py-3 text-xs font-normal normal-case tracking-normal leading-relaxed text-gray-300 shadow-[0_18px_40px_rgba(2,6,23,0.45)] backdrop-blur-sm">
                      Used for in-game admin actions and the server&apos;s REST API. Leave empty to let the panel generate one. You can change it later in Container Settings.
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showAdminPw ? 'text' : 'password'}
                    value={palworldAdminPassword ?? ''}
                    onChange={(e) => setPalworldAdminPassword(e.target.value)}
                    placeholder="Leave empty to auto-generate"
                    spellCheck={false}
                    autoComplete="off"
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPw((v) => !v)}
                    aria-label={showAdminPw ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  >
                    {showAdminPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPalworldAdminPassword(generatePalworldAdminPassword())}
                  className="flex-shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}

          {mcServerType && onPickerEnvChange && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Versions
              </label>
              <MinecraftVersionPicker
                serverType={mcServerType}
                initialEnv={pickerInitialEnv}
                canEdit={!loading}
                onEnvChange={onPickerEnvChange}
              />
            </div>
          )}

          {requireGameCopy && (
            <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 p-4">
              <p className="text-xs leading-relaxed text-blue-300">
                This game requires you to <strong>own a copy on Steam</strong>.
              </p>
            </div>
          )}

          {requireSteamCredentials && (
            <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-4 space-y-3">
              <p className="text-xs font-semibold leading-relaxed text-amber-900 dark:text-amber-100">
                This game requires Steam credentials.
              </p>
              <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-100/90">
                It is strongly recommended to create a <strong>dedicated Steam account</strong> for this server (recommended by LinuxGSM).{' '}
                <a href="https://docs.linuxgsm.com/steamcmd" target="_blank" rel="noopener noreferrer"
                  className="text-[var(--color-cyan-400)] underline underline-offset-2">
                  SteamCMD | LinuxGSM_
                </a>
              </p>
              <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-100/90">
                Use a complex password and disable email-based two-factor authentication.
              </p>
              <ol className="list-decimal pl-4 space-y-1 text-xs leading-relaxed text-amber-800 dark:text-amber-100/80">
                <li>Open Steam.</li>
                <li>At the top left, click Steam → Settings.</li>
                <li>Go to Account.</li>
                <li>Click Manage Steam Guard Account Security.</li>
                <li>Select Turn Steam Guard off, then Continue.</li>
                <li>Confirm using the link sent by email.</li>
              </ol>
              <div className="grid grid-cols-1 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Steam Username</label>
                  <input type="text" value={steamUsername ?? ''} onChange={e => setSteamUsername?.(e.target.value)}
                    autoComplete="off" placeholder="steam_username"
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Steam Password</label>
                  <input type="password" value={steamPassword ?? ''} onChange={e => setSteamPassword?.(e.target.value)}
                    autoComplete="new-password" placeholder="••••••••••"
                    className={inputCls} />
                </div>
              </div>
            </div>
          )}

          {requireEula && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-100/90">
                  To install a Minecraft server you must accept the{' '}
                  <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noopener noreferrer"
                    className="underline underline-offset-2 font-medium">
                    Minecraft End User License Agreement
                  </a>. This is your acceptance, not the panel&apos;s.
                </p>
              </div>
              <AppToggle
                checked={eulaAccepted}
                onChange={setEulaAccepted}
                label="I accept the Minecraft EULA"
              />
            </div>
          )}

          <div className="border border-gray-200 dark:border-gray-700/40 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvancedOpen(v => !v)}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-[#0f1723]/30 hover:bg-gray-100 dark:hover:bg-[#0f1723]/50 transition-colors"
            >
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Settings2 className="w-3.5 h-3.5" />
                Advanced Settings
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`} />
            </button>
            {advancedOpen && (
              <div className="px-4 pb-1 divide-y divide-gray-100 dark:divide-gray-700/40 border-t border-gray-200 dark:border-gray-700/40">
                {hytaleOptions && setHytaleOptions && (
                  <CollapsibleSection label="Hytale Options">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Patchline</label>
                        <input type="text" value={hytaleOptions.patchline}
                          onChange={(e) => setHytaleOptions({ ...hytaleOptions, patchline: e.target.value })}
                          placeholder="release | pre-release" className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Profile UUID</label>
                        <input type="text" value={hytaleOptions.profileUuid}
                          onChange={(e) => setHytaleOptions({ ...hytaleOptions, profileUuid: e.target.value })}
                          placeholder="Leave empty for default" className={inputCls} />
                      </div>
                    </div>
                  </CollapsibleSection>
                )}
                {imageRef && (
                  <CollapsibleSection label="Docker Image">
                    <code className="block w-full rounded-lg bg-gray-100 dark:bg-[#0f1723]/40 text-gray-600 dark:text-gray-400 text-xs px-4 py-2.5 font-mono break-all select-all">
                      {imageRef}
                    </code>
                  </CollapsibleSection>
                )}
                <CollapsibleSection label="Ports Binding" badge={(tcpPorts.length + udpPorts.length) || undefined}>
                  <div className="space-y-4">
                    <PortSection label="TCP Ports" rows={tcpPorts} setRows={setTcpPorts} />
                    <PortSection label="UDP Ports" rows={udpPorts} setRows={setUdpPorts} />
                  </div>
                </CollapsibleSection>
                {mountRows && setMountRows && (
                  <CollapsibleSection label="Volumes" badge={mountRows.length || undefined}>
                    <MountSection rows={mountRows} setRows={setMountRows} />
                  </CollapsibleSection>
                )}
                {showEnv && (
                  <CollapsibleSection label="Environment Variables" badge={envRows.length || undefined}>
                      <div>
                        <div className="flex justify-end mb-2">
                          <AppButton type="button" tone="ghost" onClick={() => setEnvRows([...envRows, { key: '', value: '' }])}
                            className="flex items-center gap-1 text-xs text-[var(--gp-ods-accent-primary)] dark:text-gray-400 hover:text-[var(--gp-ods-accent-secondary)] dark:hover:text-gray-200 px-2 py-1 rounded">
                            <Plus className="w-3 h-3" /> Add
                          </AppButton>
                        </div>
                        {envRows.length === 0 && <p className="text-xs text-gray-500 italic">No variables configured.</p>}
                        {envRows.map((row, i) => (
                          <div key={i} className="flex gap-2 mb-2 items-center">
                            <input type="text" placeholder="KEY" value={row.key}
                              onChange={(e) => setEnvRows(envRows.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))}
                              className="w-36 rounded-lg bg-gray-50 dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
                            <input type="text" placeholder="value" value={row.value}
                              onChange={(e) => setEnvRows(envRows.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))}
                              className="flex-1 rounded-lg bg-gray-50 dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
                            <AppButton type="button" tone="ghost" onClick={() => setEnvRows(envRows.filter((_, idx) => idx !== i))}
                              className="p-1 text-gray-400 hover:text-red-400 rounded">
                              <Trash2 className="w-3 h-3" />
                            </AppButton>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
                )}
                <CollapsibleSection label="Resource Limits">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-20 flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">vCPU</span>
                        <input type="number" min="0" step="0.1" value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)}
                          placeholder="e.g. 2" className={`${inputCls} flex-1`} />
                        {cpuLimit && (
                          <button type="button" onClick={() => setCpuLimit('')}
                            className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-20 flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">RAM (MB)</span>
                        <input type="number" min="0" step="128" value={memoryLimitMb} onChange={(e) => setMemoryLimitMb(e.target.value)}
                          placeholder="e.g. 4096" className={`${inputCls} flex-1`} />
                        {memoryLimitMb && !isNaN(Number(memoryLimitMb)) && Number(memoryLimitMb) > 0 && (
                          <span className="text-xs flex-shrink-0 text-gray-400">≈ {(Number(memoryLimitMb) / 1024).toFixed(1)} GB</span>
                        )}
                        {memoryLimitMb && (
                          <button type="button" onClick={() => setMemoryLimitMb('')}
                            className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">Leave blank for no limit.</p>
                  </CollapsibleSection>
                {catalogHealthcheck !== undefined && (
                  <CollapsibleSection label="Healthcheck">
                    <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>A wrong probe can leave the server stuck as <strong>unhealthy</strong> or never finish starting. Keep <strong>Image Default</strong> unless you know the image&apos;s listening port or main process.</span>
                    </div>
                    <HealthcheckEditor
                      key={JSON.stringify(catalogHealthcheck)}
                      initial={catalogHealthcheck ?? null}
                      onChange={onHealthcheckChange ?? (() => {})}
                    />
                  </CollapsibleSection>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <AppButton tone="ghost" onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700/50 dark:hover:bg-gray-600/50 text-gray-700 dark:text-white border border-gray-300 dark:border-gray-600/50 transition-all">
              Cancel
            </AppButton>
            <AppButton tone="primary" onClick={onConfirm} disabled={loading || !serverName.trim() || !!nameError || eulaBlocked}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? 'Installing…' : 'Install'}
              <ArrowRight className="w-4 h-4" />
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- LinuxGSM featured ----------
const LGSM_FEATURED = [
  '7 days to die', 'ark:', 'arma reforger', 'dayz',
  'garry', 'humanitz', 'palworld', 'project zomboid',
  'rust', 'satisfactory', 'team fortress 2', 'teamspeak 3', 'valheim',
];

// ---------- Main component ----------
export function InstallGameServer({
  isOpen, onClose, onInstall, installing, installError, installProgressPercent,
  installStatus, installServerId, installInteraction, setInstallInteraction, installPlan = [],
  installPermissionsSyncing = false,
  canOpenInstallLog = false, usedPorts, usedServerNames, canInstall = true,
  onClearError, onOpenConsole, onReopen,
}: InstallGameServerProps) {
  useBodyScrollLock(isOpen);

  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installingName, setInstallingName] = useState('');

  // Unified list state
  const [unifiedSearch, setUnifiedSearch] = useState('');
  const [showExternal, setShowExternal] = useState(false);
  // Remembers which form launched the in-flight install so "Reconfigure and Retry" reopens the right one.
  const [installWasExternal, setInstallWasExternal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionModalImages, setVersionModalImages] = useState<OvhcloudImage[]>([]);

  // LinuxGSM catalog
  const [lgsmGames, setLgsmGames] = useState<LinuxGsmGame[]>([]);
  const [lgsmLoading, setLgsmLoading] = useState(false);
  const [lgsmError, setLgsmError] = useState<string | null>(null);
  const [lgsmFlags, setLgsmFlags] = useState<Record<string, { steamCred: boolean; gameCopy: boolean }>>({});

  // Config modal state
  const [showConfig, setShowConfig] = useState(false);
  const [configTitle, setConfigTitle] = useState('');
  const [configSubtitle, setConfigSubtitle] = useState('');
  const [configProvider, setConfigProvider] = useState<'ovhcloud' | 'linuxgsm' | undefined>(undefined);
  const [configShowEnv, setConfigShowEnv] = useState(false);
  const [configRequireEula, setConfigRequireEula] = useState(false);
  const [serverName, setServerName] = useState('');
  const [tcpPorts, setTcpPorts] = useState<PortRow[]>([]);
  const [udpPorts, setUdpPorts] = useState<PortRow[]>([]);
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [hytaleOptions, setHytaleOptions] = useState({ patchline: '', profileUuid: '' });
  const [showHytale, setShowHytale] = useState(false);
  const [showPalworldAdmin, setShowPalworldAdmin] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [mountRows, setMountRows] = useState<MountRow[]>([]);
  const [healthcheckFromCatalog, setHealthcheckFromCatalog] = useState<Record<string, unknown> | null>(null);
  const [healthcheckEdit, setHealthcheckEdit] = useState<Record<string, unknown> | null>(null);
  const [requireSteamCredentials, setRequireSteamCredentials] = useState(false);
  const [requireGameCopy, setRequireGameCopy] = useState(false);
  const [steamUsername, setSteamUsername] = useState('');
  const [steamPassword, setSteamPassword] = useState('');
  const [pendingPayloadBase, setPendingPayloadBase] = useState<Partial<InstallGameHandlerPayload> | null>(null);

  // External (custom image) state
  const [extDockerImage, setExtDockerImage] = useState('');
  const [extServerName, setExtServerName] = useState('');
  const [extTcpPorts, setExtTcpPorts] = useState<PortRow[]>([]);
  const [extUdpPorts, setExtUdpPorts] = useState<PortRow[]>([]);
  const [extEnvRows, setExtEnvRows] = useState<EnvRow[]>([]);
  const [extMountRows, setExtMountRows] = useState<MountRow[]>([{ key: 'data', containerPath: '/data' }]);
  const [extRuntimeUser, setExtRuntimeUser] = useState('');
  const [extRuntimeUid, setExtRuntimeUid] = useState('');
  const [extRuntimeGid, setExtRuntimeGid] = useState('');
  const [extHealthcheck, setExtHealthcheck] = useState<Record<string, unknown> | null>(null);
  const [extError, setExtError] = useState<string | null>(null);

  const [cpuLimit, setCpuLimit] = useState('');
  const [memoryLimitMb, setMemoryLimitMb] = useState('');
  const [extCpuLimit, setExtCpuLimit] = useState('');
  const [extMemoryLimitMb, setExtMemoryLimitMb] = useState('');

  // Minecraft version picker state
  const [configMcServerType, setConfigMcServerType] = useState<McServerType | null>(null);
  const [pickerInitialEnv, setPickerInitialEnv] = useState<Record<string, string>>({});
  const [pickerEnv, setPickerEnv] = useState<Record<string, string>>({});

  // Load LinuxGSM catalog when modal opens
  useEffect(() => {
    if (!isOpen || lgsmGames.length > 0 || lgsmLoading) return;
    let cancelled = false;
    setLgsmLoading(true);
    setLgsmError(null);
    Promise.all([
      getLinuxGsmGames(),
      apiClient.getCatalogGames().catch(() => ({ games: [] as any[] })),
    ]).then(([games, catalog]) => {
      if (cancelled) return;
      setLgsmGames(games);
      const flags: Record<string, { steamCred: boolean; gameCopy: boolean }> = {};
      for (const item of catalog.games) {
        if (item.shortname) flags[item.shortname] = { steamCred: !!item.requireSteamCredentials, gameCopy: !!item.requireGameCopy };
      }
      setLgsmFlags(flags);
    }).catch(() => { if (!cancelled) setLgsmError('Unable to load the game list.'); })
      .finally(() => { if (!cancelled) setLgsmLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Object.keys(pickerEnv).length === 0) return;
    setEnvRows(prev =>
      prev.map(row => row.key in pickerEnv ? { ...row, value: pickerEnv[row.key] } : row)
    );
  }, [pickerEnv]);

  // Reset every transient config field to baseline at the start of each opener so state never
  // leaks between two selections. Each opener then sets only the chosen game's values.
  const resetConfigState = () => {
    setConfigTitle('');
    setConfigSubtitle('');
    setConfigProvider(undefined);
    setConfigShowEnv(false);
    setConfigRequireEula(false);
    setServerName('');
    setTcpPorts([]);
    setUdpPorts([]);
    setEnvRows([]);
    setHytaleOptions({ patchline: '', profileUuid: '' });
    setShowHytale(false);
    setShowPalworldAdmin(false);
    setConfigError(null);
    setMountRows([]);
    setHealthcheckFromCatalog(null);
    setHealthcheckEdit(null);
    setRequireSteamCredentials(false);
    setRequireGameCopy(false);
    setSteamUsername('');
    setSteamPassword('');
    setPendingPayloadBase(null);
    setConfigMcServerType(null);
    setPickerInitialEnv({});
    setPickerEnv({});
    setCpuLimit('');
    setMemoryLimitMb('');
  };

  const openOvhcloudConfig = (image: OvhcloudImage) => {
    resetConfigState();
    const ports = portsFromImage(image, usedPorts);
    const mcType = getMcServerType(image.imageId);
    const managedKeys = mcType ? getPickerManagedKeys(mcType) : [];
    const imageEnvAll = image.defaultEnv;
    const initialPicker: Record<string, string> = {};
    for (const key of managedKeys) {
      if (key in imageEnvAll) initialPicker[key] = imageEnvAll[key];
    }
    setConfigMcServerType(mcType);
    setPickerInitialEnv({});
    setPickerEnv(initialPicker);
    setConfigTitle(`Install ${image.name}`);
    setConfigSubtitle('');
    setConfigProvider('ovhcloud');
    setServerName(`${image.name} Server`);
    setTcpPorts(ports.tcp);
    setUdpPorts(ports.udp);
    const baseEnv = envFromImage(image);
    setEnvRows(
      image.family === 'palworld'
        ? [...baseEnv, { key: 'PALWORLD_ADMIN_PASSWORD', value: generatePalworldAdminPassword() }]
        : baseEnv
    );
    setConfigShowEnv(true);
    setConfigRequireEula(image.requiredEnvKeys.includes('EULA'));
    setShowHytale(image.supportsHytaleOptions);
    setHytaleOptions({ patchline: '', profileUuid: '' });
    setShowPalworldAdmin(image.family === 'palworld');
    setConfigError(null);
    setMountRows(
      image.family === 'minecraft'
        ? [
            { key: 'data', containerPath: '/data' },
            { key: 'backup', containerPath: '/backups' },
          ]
        : [{ key: 'data', containerPath: '/data' }]
    );
    setHealthcheckFromCatalog(null);
    setHealthcheckEdit(null);
    setPendingPayloadBase({ provider: 'ovhcloud', imageId: image.imageId, dockerImage: image.dockerImage });
    setShowConfig(true);
  };

  const openLgsmConfig = async (game: LinuxGsmGame) => {
    resetConfigState();
    setConfigTitle(`Install ${game.gamename}`);
    setConfigSubtitle('');
    setConfigProvider('linuxgsm');
    setServerName(`${game.gamename} Server`);
    setTcpPorts([]);
    setUdpPorts([]);
    setEnvRows([]);
    setConfigShowEnv(true);
    setConfigRequireEula(false);
    setShowHytale(false);
    setConfigError(null);
    setMountRows([
      { key: 'data', containerPath: '/data' },
      { key: 'backup', containerPath: '/app/lgsm/backup' },
    ]);
    setHealthcheckFromCatalog(null);
    setHealthcheckEdit(null);
    setRequireSteamCredentials(false);
    setRequireGameCopy(false);
    setSteamUsername('');
    setSteamPassword('');
    setPendingPayloadBase({ provider: 'linuxgsm', shortname: game.shortname, dockerImage: `ghcr.io/gameservermanagers/gameserver:${game.shortname}` });
    setShowConfig(true);

    const meta = await apiClient.getCatalogGame(game.shortname);
    if (meta?.ports) {
      const usedTcp = new Set(usedPorts?.tcp ?? []);
      const usedUdp = new Set(usedPorts?.udp ?? []);
      const allocatedTcp = new Set<number>();
      const allocatedUdp = new Set<number>();
      setTcpPorts((meta.ports.tcp ?? []).map((p: { host: number; container: number; label?: string }) => {
        const port = findAvailablePort(p.host, new Set([...usedTcp, ...allocatedTcp]));
        allocatedTcp.add(port);
        return { host: String(port), container: String(p.container), label: p.label ?? '' };
      }));
      setUdpPorts((meta.ports.udp ?? []).map((p: { host: number; container: number; label?: string }) => {
        const port = findAvailablePort(p.host, new Set([...usedUdp, ...allocatedUdp]));
        allocatedUdp.add(port);
        return { host: String(port), container: String(p.container), label: p.label ?? '' };
      }));
    }
    if (meta?.healthcheck) {
      const hc = meta.healthcheck as Record<string, unknown>;
      setHealthcheckFromCatalog(hc);
      setHealthcheckEdit(hc);
    }
    setRequireSteamCredentials(meta?.requireSteamCredentials ?? false);
    setRequireGameCopy(meta?.requireGameCopy ?? false);
  };

  const handleConfigConfirm = async () => {
    if (!pendingPayloadBase) return;
    const isLgsm = pendingPayloadBase.provider === 'linuxgsm';
    if (isLgsm && requireSteamCredentials && (!steamUsername.trim() || !steamPassword.trim())) {
      setConfigError('Steam credentials are required: please fill in Steam Username and Password.');
      return;
    }
    if (configRequireEula && String(envRowsToRecord(envRows).EULA ?? '').toUpperCase() !== 'TRUE') {
      setConfigError('You must accept the Minecraft EULA to install this server.');
      return;
    }
    const cpuVal = parseFloat(cpuLimit);
    const memVal = parseInt(memoryLimitMb, 10);
    const payload: InstallGameHandlerPayload = {
      ...pendingPayloadBase as any,
      name: serverName.trim(),
      ports: { tcp: parsePortRows(tcpPorts), udp: parsePortRows(udpPorts) },
      healthcheck: healthcheckEdit as any ?? null,
      mounts: mountRows.filter((m) => m.key.trim() && m.containerPath.trim()),
      env: configShowEnv ? { ...pickerEnv, ...envRowsToRecord(envRows) } : undefined,
      ...(showHytale ? { imageOptions: { patchline: hytaleOptions.patchline || undefined, profileUuid: hytaleOptions.profileUuid || null } } : {}),
      ...(isLgsm && requireSteamCredentials ? { requireSteamCredentials: true, steamUsername: steamUsername.trim(), steamPassword: steamPassword } : {}),
      resourceLimits: (cpuVal > 0 || memVal > 0) ? { cpu: cpuVal > 0 ? cpuVal : 0, memoryMb: memVal > 0 ? memVal : 0 } : null,
    };
    setInstallWasExternal(false);
    setInstallingName(serverName.trim());
    setShowConfig(false);
    setShowInstallModal(true);
    onClose();
    await onInstall(payload);
  };

  const handleExternalInstall = async () => {
    setExtError(null);
    if (!extDockerImage.trim()) { setExtError('Docker image is required.'); return; }
    if (!extServerName.trim()) { setExtError('Server name is required.'); return; }
    if (usedServerNames?.includes(extServerName.trim())) { setExtError('A server with this name already exists.'); return; }
    if (hasIncompletePortRow(extTcpPorts) || hasIncompletePortRow(extUdpPorts)) {
      setExtError('Each port row must have both a Host port and a Container port. Complete it or remove the row.');
      return;
    }
    if (!extRuntimeUser.trim() || extRuntimeUid.trim() === '' || extRuntimeGid.trim() === '') {
      setExtError('Runtime identity is required: please fill in User, UID and GID.');
      return;
    }
    const runtimeUid = Number(extRuntimeUid);
    const runtimeGid = Number(extRuntimeGid);
    if (!Number.isInteger(runtimeUid) || runtimeUid < 0 || !Number.isInteger(runtimeGid) || runtimeGid < 0) {
      setExtError('UID and GID must be non-negative integers.');
      return;
    }
    const extCpuVal = parseFloat(extCpuLimit);
    const extMemVal = parseInt(extMemoryLimitMb, 10);
    const payload: InstallGameHandlerPayload = {
      provider: 'external',
      name: extServerName.trim(),
      dockerImage: extDockerImage.trim(),
      ports: { tcp: parsePortRows(extTcpPorts), udp: parsePortRows(extUdpPorts) },
      healthcheck: extHealthcheck as any ?? null,
      env: envRowsToRecord(extEnvRows),
      mounts: extMountRows.filter((m) => m.key.trim() && m.containerPath.trim()),
      runtimeIdentity: { user: extRuntimeUser.trim(), uid: runtimeUid, gid: runtimeGid },
      resourceLimits: (extCpuVal > 0 || extMemVal > 0) ? { cpu: extCpuVal > 0 ? extCpuVal : 0, memoryMb: extMemVal > 0 ? extMemVal : 0 } : null,
    };
    setInstallWasExternal(true);
    setInstallingName(extServerName.trim());
    setShowInstallModal(true);
    onClose();
    await onInstall(payload);
  };

  // Filtered lists
  const searchLower = unifiedSearch.toLowerCase().trim();

  const ovhFiltered = OVH_UNIFIED.filter(g =>
    !searchLower || g.displayName.toLowerCase().includes(searchLower)
  );

  const lgsmFiltered = filterLgsmForUnified(lgsmGames)
    .filter(g =>
      !searchLower ||
      g.gamename.toLowerCase().includes(searchLower) ||
      g.shortname.toLowerCase().includes(searchLower)
    )
    .sort((a, b) => {
      const aF = LGSM_FEATURED.some(k => a.gamename.toLowerCase().includes(k));
      const bF = LGSM_FEATURED.some(k => b.gamename.toLowerCase().includes(k));
      if (aF && !bF) return -1;
      if (!aF && bF) return 1;
      return a.gamename.localeCompare(b.gamename);
    });

  const noResults = !lgsmLoading && searchLower && ovhFiltered.length === 0 && lgsmFiltered.length === 0;

  const handleClose = () => {
    onClose();
    onClearError?.();
    setShowExternal(false);
    setUnifiedSearch('');
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-gp-surface-card w-full max-w-3xl rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-2xl h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-700/50 flex-shrink-0 bg-gp-surface-card rounded-t-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Install Game Server</h2>
                {showExternal && (
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Custom Docker image</p>
                )}
              </div>
              <AppButton
                type="button"
                onClick={handleClose}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-400 hover:text-red-400"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </AppButton>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* ---- Unified game list ---- */}
              {!showExternal && (
                <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
                  <div className="space-y-4">

                    {/* Search bar + Custom image button */}
                    <div className="flex gap-3 items-stretch">
                      <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Search games…"
                          value={unifiedSearch}
                          onChange={(e) => setUnifiedSearch(e.target.value)}
                          className="w-full rounded-xl bg-white dark:bg-white/5 border border-gray-300 dark:border-gray-700/40 text-gray-900 dark:text-white text-sm pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20 focus:border-transparent transition-all placeholder:text-gray-400"
                        />
                        {unifiedSearch && (
                          <button
                            type="button"
                            onClick={() => setUnifiedSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowExternal(true)}
                        className="flex-shrink-0 self-stretch flex items-center gap-1.5 px-3 py-3 rounded-xl text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-700/40 hover:border-gray-400 dark:hover:border-gray-500/60 bg-white dark:bg-white/5 transition-all whitespace-nowrap"
                      >
                        <Package className="w-3.5 h-3.5" />
                        Custom image
                      </button>
                    </div>

                    {/* Loading */}
                    {lgsmLoading && (
                      <div className="flex items-center justify-center py-10">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-8 h-8 rounded-full border-2 border-[var(--gp-ods-accent-primary)] dark:border-white/30 border-t-transparent animate-spin" />
                          <p className="text-sm text-gray-500 dark:text-gray-400">Loading games…</p>
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {lgsmError && !lgsmLoading && (
                      <div className="flex items-center justify-center py-4">
                        <p className="text-sm text-red-400">{lgsmError}</p>
                      </div>
                    )}

                    {/* No results */}
                    {noResults && (
                      <div className="flex flex-col items-center justify-center py-12 gap-2">
                        <Search className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">No games found for "{unifiedSearch}"</p>
                      </div>
                    )}

                    {/* Game grid */}
                    {!lgsmLoading && !noResults && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">

                        {/* OVHcloud games first */}
                        {ovhFiltered.map((game) => (
                          <div
                            key={game.id}
                            className="flex items-center justify-between bg-gp-surface-elevated border border-gray-200 dark:border-gray-700/40 rounded-xl px-4 py-3 shadow-sm dark:shadow-none hover:border-gray-400 dark:hover:border-gray-500/70 hover:bg-gp-surface-input transition-all"
                          >
                            <span className="text-sm font-medium text-gray-900 dark:text-white truncate mr-3">
                              {game.displayName}
                            </span>
                            <AppButton
                              type="button"
                              disabled={!canInstall}
                              onClick={() => {
                                if (!canInstall) return;
                                if (game.hasVersionSelection) {
                                  setVersionModalImages(game.images);
                                  setShowVersionModal(true);
                                } else {
                                  openOvhcloudConfig(game.images[0]);
                                }
                              }}
                              tone="primary"
                              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Select <ArrowRight className="w-3 h-3" />
                            </AppButton>
                          </div>
                        ))}

                        {/* LinuxGSM games after */}
                        {lgsmFiltered.slice(0, Math.max(0, 200 - ovhFiltered.length)).map((game) => (
                          <div
                            key={game.shortname}
                            className="flex items-center justify-between bg-gp-surface-elevated border border-gray-200 dark:border-gray-700/40 rounded-xl px-4 py-3 shadow-sm dark:shadow-none hover:border-gray-400 dark:hover:border-gray-500/70 hover:bg-gp-surface-input transition-all"
                          >
                            <div className="min-w-0 mr-3 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{game.gamename}</p>
                              {(lgsmFlags[game.shortname]?.steamCred || lgsmFlags[game.shortname]?.gameCopy) && (
                                <div className="flex gap-1 mt-1 flex-wrap">
                                  {lgsmFlags[game.shortname]?.steamCred && (
                                    <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#e8eef5] text-[#1b2838] border border-[#cdd9e5] dark:bg-[#1b2838] dark:text-[#ffffff] dark:border-[#2a475e]">
                                      Steam login required
                                    </span>
                                  )}
                                  {lgsmFlags[game.shortname]?.gameCopy && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                      Own on Steam
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <AppButton
                              type="button"
                              onClick={() => { if (!canInstall) return; openLgsmConfig(game); }}
                              disabled={!canInstall}
                              tone="primary"
                              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Select <ArrowRight className="w-3 h-3" />
                            </AppButton>
                          </div>
                        ))}

                        {/* Refine hint when truncated */}
                        {lgsmFiltered.length > 200 - ovhFiltered.length && (
                          <div className="sm:col-span-2 text-center">
                            <p className="text-xs text-gray-400 py-1">
                              Showing {200 - ovhFiltered.length} of {lgsmFiltered.length} community games — refine your search
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ---- Custom image (External) ---- */}
              {showExternal && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    <div className="space-y-6 max-w-lg mx-auto">

                      <button
                        type="button"
                        onClick={() => setShowExternal(false)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to games
                      </button>

                      <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 bg-gp-surface-elevated shadow-sm dark:shadow-none p-5 space-y-5">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Docker Image <span className="text-red-400">*</span>
                          </label>
                          <input type="text" value={extDockerImage} onChange={(e) => setExtDockerImage(e.target.value)}
                            placeholder="ghcr.io/user/image:latest" className={`${inputCls} font-mono`} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Server Name <span className="text-red-400">*</span>
                          </label>
                          <input type="text" value={extServerName} onChange={(e) => setExtServerName(e.target.value)}
                            placeholder="My Custom Server" className={inputCls} />
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 bg-gp-surface-elevated shadow-sm dark:shadow-none p-5 space-y-5">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ports Binding</p>
                        <PortSection label="TCP Ports" rows={extTcpPorts} setRows={setExtTcpPorts} />
                        <PortSection label="UDP Ports" rows={extUdpPorts} setRows={setExtUdpPorts} />
                      </div>

                      <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 bg-gp-surface-elevated shadow-sm dark:shadow-none p-5">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Volumes</span>
                          <AppButton type="button" tone="ghost"
                            onClick={() => setExtMountRows([...extMountRows, { key: '', containerPath: '' }])}
                            className="flex items-center gap-1 text-xs text-[var(--gp-ods-accent-primary)] dark:text-gray-400 hover:text-[var(--gp-ods-accent-secondary)] dark:hover:text-gray-200 px-2 py-1 rounded">
                            <Plus className="w-3 h-3" /> Add
                          </AppButton>
                        </div>
                        {extMountRows.length === 0 && <p className="text-xs text-gray-400 italic">No volumes configured.</p>}
                        {extMountRows.length > 0 && (
                          <div className="flex gap-2 mb-1 items-center">
                            <span className="w-36 text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</span>
                            <span className="text-xs invisible" aria-hidden>→</span>
                            <span className="flex-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Container path</span>
                            <span className="p-1 invisible" aria-hidden><Trash2 className="w-3 h-3" /></span>
                          </div>
                        )}
                        {extMountRows.map((row, i) => (
                          <div key={i} className="flex gap-2 mb-2 items-center">
                            <input type="text" placeholder="volume-key" value={row.key}
                              onChange={(e) => setExtMountRows(extMountRows.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))}
                              className="w-36 rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-2 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
                            <span className="text-gray-400 text-xs">→</span>
                            <input type="text" placeholder="/container/path" value={row.containerPath}
                              onChange={(e) => setExtMountRows(extMountRows.map((r, idx) => idx === i ? { ...r, containerPath: e.target.value } : r))}
                              className="flex-1 rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-2 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
                            <AppButton type="button" tone="ghost"
                              onClick={() => setExtMountRows(extMountRows.filter((_, idx) => idx !== i))}
                              className="p-1 text-gray-400 hover:text-red-400 rounded">
                              <Trash2 className="w-3 h-3" />
                            </AppButton>
                          </div>
                        ))}
                        <p className="text-xs text-gray-400 mt-3">Host path is computed automatically per server and mount key.</p>
                      </div>

                      <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 bg-gp-surface-elevated shadow-sm dark:shadow-none p-5 space-y-4">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Runtime Identity <span className="text-red-400">*</span></p>
                        <div className="grid grid-cols-3 gap-4">
                          {[
                            { label: 'User', value: extRuntimeUser, set: setExtRuntimeUser, placeholder: 'root', type: 'text' },
                            { label: 'UID', value: extRuntimeUid, set: setExtRuntimeUid, placeholder: '0', type: 'number' },
                            { label: 'GID', value: extRuntimeGid, set: setExtRuntimeGid, placeholder: '0', type: 'number' },
                          ].map(({ label, value, set, placeholder, type }) => (
                            <div key={label}>
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
                              <input type={type} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                                className="w-full rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 bg-gp-surface-elevated shadow-sm dark:shadow-none p-5">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Environment Variables</span>
                          <AppButton type="button" tone="ghost"
                            onClick={() => setExtEnvRows([...extEnvRows, { key: '', value: '' }])}
                            className="flex items-center gap-1 text-xs text-[var(--gp-ods-accent-primary)] dark:text-gray-400 hover:text-[var(--gp-ods-accent-secondary)] dark:hover:text-gray-200 px-2 py-1 rounded">
                            <Plus className="w-3 h-3" /> Add
                          </AppButton>
                        </div>
                        {extEnvRows.length === 0 && <p className="text-xs text-gray-400 italic">No variables configured.</p>}
                        {extEnvRows.map((row, i) => (
                          <div key={i} className="flex gap-2 mb-2 items-center">
                            <input type="text" placeholder="KEY" value={row.key}
                              onChange={(e) => setExtEnvRows(extEnvRows.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))}
                              className="w-36 rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-2 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
                            <input type="text" placeholder="value" value={row.value}
                              onChange={(e) => setExtEnvRows(extEnvRows.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))}
                              className="flex-1 rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-2 py-2 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
                            <AppButton type="button" tone="ghost"
                              onClick={() => setExtEnvRows(extEnvRows.filter((_, idx) => idx !== i))}
                              className="p-1 text-gray-400 hover:text-red-400 rounded">
                              <Trash2 className="w-3 h-3" />
                            </AppButton>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 bg-gp-surface-elevated shadow-sm dark:shadow-none p-5 space-y-4">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resource Limits</p>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="w-20 flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">vCPU</span>
                            <input type="number" min="0" step="0.1" value={extCpuLimit} onChange={(e) => setExtCpuLimit(e.target.value)}
                              placeholder="e.g. 2"
                              className="flex-1 rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
                            {extCpuLimit && (
                              <button type="button" onClick={() => setExtCpuLimit('')}
                                className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-20 flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">RAM (MB)</span>
                            <input type="number" min="0" step="128" value={extMemoryLimitMb} onChange={(e) => setExtMemoryLimitMb(e.target.value)}
                              placeholder="e.g. 4096"
                              className="flex-1 rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20" />
                            {extMemoryLimitMb && !isNaN(Number(extMemoryLimitMb)) && Number(extMemoryLimitMb) > 0 && (
                              <span className="text-xs flex-shrink-0 text-gray-400">≈ {(Number(extMemoryLimitMb) / 1024).toFixed(1)} GB</span>
                            )}
                            {extMemoryLimitMb && (
                              <button type="button" onClick={() => setExtMemoryLimitMb('')}
                                className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-400">Leave blank for no limit.</p>
                      </div>

                      <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 bg-gp-surface-elevated shadow-sm dark:shadow-none p-5 space-y-4">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Healthcheck</p>
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 dark:text-amber-300">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>Custom images ship no healthcheck metadata. A wrong probe can leave the server stuck as <strong>unhealthy</strong> or never finish starting. Keep <strong>Image Default</strong> unless you know the image&apos;s listening port or main process.</span>
                        </div>
                        <HealthcheckEditor initial={null} onChange={setExtHealthcheck} />
                      </div>

                      {extError && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                          {extError}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 px-6 py-5 border-t border-gray-200 dark:border-gray-700/50">
                    <div className="max-w-lg mx-auto">
                      <AppButton
                        tone="primary"
                        onClick={handleExternalInstall}
                        disabled={!canInstall || !extDockerImage.trim() || !extServerName.trim() || !extRuntimeUser.trim() || extRuntimeUid.trim() === '' || extRuntimeGid.trim() === ''}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Install Server <ArrowRight className="w-4 h-4" />
                      </AppButton>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Minecraft version selection modal */}
      {showVersionModal && (
        <GameVersionModal
          images={versionModalImages}
          onSelect={(image) => {
            setShowVersionModal(false);
            openOvhcloudConfig(image);
          }}
          onClose={() => setShowVersionModal(false)}
        />
      )}

      {showConfig && (
        <ConfigModal
          title={configTitle}
          subtitle={configSubtitle}
          provider={configProvider}
          imageRef={pendingPayloadBase?.dockerImage}
          serverName={serverName}
          setServerName={setServerName}
          tcpPorts={tcpPorts}
          setTcpPorts={setTcpPorts}
          udpPorts={udpPorts}
          setUdpPorts={setUdpPorts}
          envRows={envRows}
          setEnvRows={setEnvRows}
          showEnv={configShowEnv}
          mountRows={mountRows}
          setMountRows={setMountRows}
          catalogHealthcheck={healthcheckFromCatalog}
          onHealthcheckChange={setHealthcheckEdit}
          hytaleOptions={showHytale ? hytaleOptions : undefined}
          setHytaleOptions={showHytale ? setHytaleOptions : undefined}
          showPalworldAdmin={showPalworldAdmin}
          usedServerNames={usedServerNames}
          requireSteamCredentials={requireSteamCredentials || undefined}
          steamUsername={steamUsername}
          setSteamUsername={setSteamUsername}
          steamPassword={steamPassword}
          setSteamPassword={setSteamPassword}
          requireGameCopy={requireGameCopy || undefined}
          cpuLimit={cpuLimit}
          setCpuLimit={setCpuLimit}
          memoryLimitMb={memoryLimitMb}
          setMemoryLimitMb={setMemoryLimitMb}
          error={configError}
          loading={installing}
          onConfirm={handleConfigConfirm}
          onCancel={() => { setShowConfig(false); setPendingPayloadBase(null); setConfigMcServerType(null); onClearError?.(); }}
          mcServerType={configMcServerType}
          pickerInitialEnv={pickerInitialEnv}
          onPickerEnvChange={setPickerEnv}
          requireEula={configRequireEula}
        />
      )}

      <InstallationProgressModal
        isOpen={showInstallModal}
        gameName={installingName}
        installing={installing}
        installError={installError}
        progressPercent={installProgressPercent ?? undefined}
        status={installStatus ?? undefined}
        serverId={installServerId ?? undefined}
        installInteraction={installInteraction ?? null}
        installPlan={installPlan}
        onRespondToInteraction={setInstallInteraction ? async (interactionId, response) => {
          if (!installServerId) return;
          await apiClient.respondToInstallInteraction(installServerId, interactionId, response);
        } : undefined}
        permissionsSyncing={installPermissionsSyncing}
        canOpenConsole={canOpenInstallLog}
        onClose={() => setShowInstallModal(false)}
        onOpenConsole={(serverId) => onOpenConsole?.(serverId)}
        onRetryInstall={() => {
          setShowInstallModal(false);
          const usedTcp = new Set(usedPorts?.tcp ?? []);
          const usedUdp = new Set(usedPorts?.udp ?? []);
          const allocatedTcp = new Set<number>();
          const allocatedUdp = new Set<number>();
          // Re-pick a free host port for each row, skipping empty rows so they stay empty.
          const remapTcp = (prev: PortRow[]) => prev.map((row) => {
            if (!row.host.trim()) return row;
            const port = findAvailablePort(Number(row.host), new Set([...usedTcp, ...allocatedTcp]));
            allocatedTcp.add(port);
            return { ...row, host: String(port) };
          });
          const remapUdp = (prev: PortRow[]) => prev.map((row) => {
            if (!row.host.trim()) return row;
            const port = findAvailablePort(Number(row.host), new Set([...usedUdp, ...allocatedUdp]));
            allocatedUdp.add(port);
            return { ...row, host: String(port) };
          });
          if (installWasExternal) {
            // The custom-image form lives inside the isOpen-gated modal, so reopen it before showing.
            setExtTcpPorts(remapTcp);
            setExtUdpPorts(remapUdp);
            setShowExternal(true);
            onReopen?.();
          } else {
            setTcpPorts(remapTcp);
            setUdpPorts(remapUdp);
            setShowConfig(true);
          }
        }}
      />
    </>
  );
}
