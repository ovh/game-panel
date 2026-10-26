import React, { useEffect, useState } from 'react';
import { useBodyScrollLock } from '../src/ui/utils/useBodyScrollLock';
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, Eye, EyeOff, Package, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import { InstallationProgressModal } from './InstallationProgressModal';
import type { InstallGameHandlerPayload } from './app/appActionHandlers';
import type { InstallInteraction, InstallStep } from '../types/gameServer';
import { minecraftJavaVariants, type OvhcloudImage } from '../utils/ovhcloudCatalog';
import { OVH_UNIFIED, filterLgsmForUnified } from '../utils/unifiedGameCatalog';
import { getLinuxGsmGames, type LinuxGsmGame } from '../utils/linuxGsmCatalog';
import { apiClient, type Cod4FilesStatus } from '../utils/api';
import { GameVersionModal } from './GameVersionModal';
import { AppButton, AppSelect, AppToggle, InfoTip } from '../src/ui/components';
import { ProviderLogo } from './gameServersTable/ProviderBadge';
import { MinecraftVersionPicker, type JavaImageOption } from './MinecraftVersionPicker';
import { getMcServerType, getPickerManagedKeys, type McServerType } from '../utils/minecraftCatalog';
import { fetchProjectZomboidBranches, type ProjectZomboidBranch } from '../utils/projectZomboidBranches';

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

function makeUniqueServerName(base: string, used?: string[]): string {
  const taken = new Set(used ?? []);
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

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
  showProjectZomboidFields?: boolean;
  showRustFields?: boolean;
  showValheimFields?: boolean;
  showCod4Fields?: boolean;
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
  pickerJavaImages?: JavaImageOption[];
  onPickerJavaImageChange?: (img: { imageId: string; dockerImage: string }) => void;
  requireEula?: boolean;
}

function generatePalworldAdminPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// CoD4 RCON password: up to 8 letters and numbers (a longer one or special characters give "Bad rcon").
// Generated with 8 characters: at least one small letter, one capital and one number.
const COD4_RCON_PATTERN = /^[A-Za-z0-9]{1,8}$/;
function generateCod4RconPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(8);
  for (;;) {
    crypto.getRandomValues(bytes);
    const password = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password)) return password;
  }
}

function ConfigModal({
  title, subtitle, provider, imageRef, serverName, setServerName, tcpPorts, setTcpPorts, udpPorts, setUdpPorts,
  envRows, setEnvRows, showEnv, mountRows, setMountRows, catalogHealthcheck, onHealthcheckChange,
  hytaleOptions, setHytaleOptions,
  showPalworldAdmin,
  showProjectZomboidFields,
  showRustFields,
  showValheimFields,
  showCod4Fields,
  usedServerNames,
  requireSteamCredentials, steamUsername, setSteamUsername, steamPassword, setSteamPassword,
  requireGameCopy,
  cpuLimit, setCpuLimit, memoryLimitMb, setMemoryLimitMb,
  error, loading, onConfirm, onCancel,
  mcServerType, pickerInitialEnv, onPickerEnvChange, pickerJavaImages, onPickerJavaImageChange, requireEula,
}: ConfigModalProps) {
  useBodyScrollLock(true);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [showAdminPw, setShowAdminPw] = React.useState(false);
  const [showRconPw, setShowRconPw] = React.useState(false);
  const [showValheimPw, setShowValheimPw] = React.useState(false);

  React.useEffect(() => {
    if (error) setAdvancedOpen(true);
  }, [error]);

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

  const upsertEnv = (key: string, val: string) => {
    const idx = envRows.findIndex((r) => r.key.trim().toUpperCase() === key);
    if (idx >= 0) {
      setEnvRows(envRows.map((r, i) => (i === idx ? { ...r, value: val } : r)));
    } else {
      setEnvRows([...envRows, { key, value: val }]);
    }
  };
  const pzBranch = envRows.find((r) => r.key.trim().toUpperCase() === 'PZ_BRANCH')?.value ?? '';
  const setPzBranch = (val: string) => upsertEnv('PZ_BRANCH', val);
  const pzAdminPassword = envRows.find((r) => r.key.trim().toUpperCase() === 'PZ_ADMIN_PASSWORD')?.value ?? '';
  const setPzAdminPassword = (val: string) => upsertEnv('PZ_ADMIN_PASSWORD', val);

  const [pzBranches, setPzBranches] = React.useState<ProjectZomboidBranch[]>([]);
  React.useEffect(() => {
    if (!showProjectZomboidFields) return;
    let cancelled = false;
    void fetchProjectZomboidBranches().then((list) => { if (!cancelled) setPzBranches(list); });
    return () => { cancelled = true; };
  }, [showProjectZomboidFields]);

  // Seed required PZ_* env rows so they are always present, visible and editable in
  // the Environment Variables list. The backend relies on them (wipe, future map
  // upload) and this avoids failures when the user edits their config manually.
  // Empty PZ_BRANCH = default/stable; PZ_SERVERNAME defaults to "servertest".
  const pzEnvSeeded = React.useRef(false);
  React.useEffect(() => {
    if (!showProjectZomboidFields) { pzEnvSeeded.current = false; return; }
    if (pzEnvSeeded.current || envRows.length === 0) return;
    pzEnvSeeded.current = true;
    const defaults = [
      { key: 'PZ_BRANCH', value: '' },
      { key: 'PZ_SERVERNAME', value: 'servertest' },
    ];
    const missing = defaults.filter(
      (d) => !envRows.some((r) => r.key.trim().toUpperCase() === d.key)
    );
    if (missing.length > 0) setEnvRows([...envRows, ...missing]);
  }, [showProjectZomboidFields, envRows, setEnvRows]);

  const rustRcon = envRows.find((r) => r.key.trim().toUpperCase() === 'RUST_RCON_PASSWORD')?.value ?? '';
  const setRustRcon = (val: string) => upsertEnv('RUST_RCON_PASSWORD', val);
  // Rust silently disables WebRCON below 8 chars (console breaks) — enforce it here.
  const rustRconTooShort = Boolean(showRustFields) && rustRcon.trim().length < 8;

  const valheimPassword =
    envRows.find((r) => r.key.trim().toUpperCase() === 'VALHEIM_SERVER_PASSWORD')?.value ?? '';
  const setValheimPassword = (val: string) => upsertEnv('VALHEIM_SERVER_PASSWORD', val);
  // A listed server needs a password of at least 5 characters or the game refuses to start.
  const valheimPasswordTooShort = Boolean(showValheimFields) && valheimPassword.trim().length < 5;

  // Call of Duty 4 slots: the backend writes them as LinuxGSM's maxplayers (+set sv_maxclients)
  const cod4Slots = envRows.find((r) => r.key.trim().toUpperCase() === 'COD4_MAXPLAYERS')?.value ?? '';
  const setCod4Slots = (val: string) => upsertEnv('COD4_MAXPLAYERS', val);
  const cod4SlotsInvalid =
    Boolean(showCod4Fields) && !(/^\d+$/.test(cod4Slots.trim()) && Number(cod4Slots) >= 1 && Number(cod4Slots) <= 64);
  // RCON password: the backend puts it on the server's startup line (+rcon_password), never into server.cfg
  const cod4Rcon = envRows.find((r) => r.key.trim().toUpperCase() === 'COD4_RCON_PASSWORD')?.value ?? '';
  const setCod4Rcon = (val: string) => upsertEnv('COD4_RCON_PASSWORD', val);
  const cod4RconInvalid = Boolean(showCod4Fields) && !COD4_RCON_PATTERN.test(cod4Rcon.trim());
  const [showCod4Rcon, setShowCod4Rcon] = React.useState(false);
  React.useEffect(() => {
    if (!showCod4Fields) return;
    const missing: Array<{ key: string; value: string }> = [];
    if (!envRows.some((r) => r.key.trim().toUpperCase() === 'COD4_MAXPLAYERS')) missing.push({ key: 'COD4_MAXPLAYERS', value: '32' });
    if (!envRows.some((r) => r.key.trim().toUpperCase() === 'COD4_RCON_PASSWORD')) {
      missing.push({ key: 'COD4_RCON_PASSWORD', value: generateCod4RconPassword() });
    }
    if (missing.length > 0) setEnvRows([...envRows, ...missing]);
  }, [showCod4Fields, envRows, setEnvRows]);
  // CoD4 installs only from the cod4-linux folder on the panel server: check it before the install can start
  const [cod4Files, setCod4Files] = React.useState<Cod4FilesStatus | null>(null);
  const [cod4FilesError, setCod4FilesError] = React.useState<string | null>(null);
  const [cod4DefaultSlots, setCod4DefaultSlots] = React.useState<number | null>(null);
  React.useEffect(() => {
    // only while the form still shows the built-in 32
    if (showCod4Fields && cod4DefaultSlots !== null && cod4DefaultSlots !== 32 && cod4Slots === '32') setCod4Slots(String(cod4DefaultSlots));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cod4DefaultSlots]);
  const checkCod4Files = React.useCallback(() => {
    setCod4Files(null);
    setCod4FilesError(null);
    apiClient
      .getCod4FilesStatus()
      .then((status) => {
        setCod4Files(status);
        // Admin → CoD4 files: slots of new servers
        const slots = (status as Cod4FilesStatus & { defaultSlots?: number }).defaultSlots;
        if (typeof slots === 'number') setCod4DefaultSlots(slots);
      })
      .catch((e) => setCod4FilesError(e?.response?.data?.error ?? 'Could not check the CoD4 files.'));
  }, []);
  React.useEffect(() => {
    if (showCod4Fields) checkCod4Files();
  }, [showCod4Fields, checkCod4Files]);
  const cod4FilesBlocked = Boolean(showCod4Fields) && !cod4Files?.ready;

  const rustEnvSeeded = React.useRef(false);
  React.useEffect(() => {
    if (!showRustFields) { rustEnvSeeded.current = false; return; }
    if (rustEnvSeeded.current || envRows.length === 0) return;
    rustEnvSeeded.current = true;
    if (!envRows.some((r) => r.key.trim().toUpperCase() === 'RUST_SERVER_IDENTITY')) {
      setEnvRows([...envRows, { key: 'RUST_SERVER_IDENTITY', value: 'rust-server' }]);
    }
  }, [showRustFields, envRows, setEnvRows]);

  const pzBranchDefaulted = React.useRef(false);
  React.useEffect(() => {
    if (!showProjectZomboidFields) { pzBranchDefaulted.current = false; return; }
    if (pzBranchDefaulted.current || pzBranches.length === 0) return;
    pzBranchDefaulted.current = true;
    if (pzBranch.trim() === '') setPzBranch(pzBranches[0].name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProjectZomboidFields, pzBranches]);

  const branchOptions = React.useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const b of pzBranches) {
      if (seen.has(b.name)) continue;
      seen.add(b.name);
      opts.push({ value: b.name, label: b.name });
    }
    const current = pzBranch.trim();
    if (current && !seen.has(current)) opts.push({ value: current, label: current });
    return opts;
  }, [pzBranches, pzBranch]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gradient-to-br dark:from-[#1f2937] dark:to-[#111827] border border-gray-200 dark:border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
       <div className="max-h-[90vh] overflow-y-auto">
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
            <input type="text" value={serverName}
              onChange={(e) => setServerName(makeUniqueServerName(e.target.value, usedServerNames))}
              placeholder="My Game Server" className={inputCls} />
          </div>

          {showPalworldAdmin && (
            <div>
              <div className="mb-2 flex">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Palworld Admin Password
                  <InfoTip text="Used for in-game admin actions and the server's REST API. Leave empty to let the panel generate one. You can change it later in Container Settings." />
                </span>
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

          {showValheimFields && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Server Password
                <InfoTip text="Required to join. The server is listed in the community browser, which Valheim only allows with a password. You can change it later in the server settings." />
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showValheimPw ? 'text' : 'password'}
                    value={valheimPassword}
                    onChange={(e) => setValheimPassword(e.target.value)}
                    placeholder="At least 5 characters"
                    spellCheck={false}
                    autoComplete="off"
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowValheimPw((v) => !v)}
                    aria-label={showValheimPw ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  >
                    {showValheimPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setValheimPassword(generatePalworldAdminPassword())}
                  className="flex-shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                  Regenerate
                </button>
              </div>
              {valheimPasswordTooShort && (
                <p className="mt-1.5 text-xs text-red-400">
                  Must be at least 5 characters.
                </p>
              )}
            </div>
          )}

          {showCod4Fields && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Slots
                <InfoTip text="Maximum number of players (sv_maxclients), 1 to 64. You can change it later in Settings > Game config > Command line." />
              </label>
              <input
                type="number"
                min={1}
                max={64}
                value={cod4Slots}
                onChange={(e) => setCod4Slots(e.target.value)}
                className={`${inputCls} max-w-[10rem]`}
              />
              {cod4SlotsInvalid && <p className="mt-1.5 text-xs text-red-400">Enter a number from 1 to 64.</p>}
            </div>
          )}

          {showCod4Fields && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                RCON Password
                <InfoTip text="Up to 8 small and capital letters and numbers. It goes on the server's startup line (not into server.cfg). You can change it later in Settings > Game config > Command line." />
              </label>
              <div className="flex gap-2 max-w-sm">
                <div className="relative flex-1">
                  <input
                    type={showCod4Rcon ? 'text' : 'password'}
                    value={cod4Rcon}
                    onChange={(e) => setCod4Rcon(e.target.value.trim())}
                    maxLength={8}
                    placeholder="Up to 8 letters and numbers"
                    spellCheck={false}
                    autoComplete="off"
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCod4Rcon((v) => !v)}
                    aria-label={showCod4Rcon ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  >
                    {showCod4Rcon ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setCod4Rcon(generateCod4RconPassword())}
                  className="flex-shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                  Regenerate
                </button>
              </div>
              {cod4RconInvalid && (
                <p className="mt-1.5 text-xs text-red-400">Up to 8 characters: small and capital letters and numbers only.</p>
              )}
            </div>
          )}

          {showCod4Fields && (
            <div
              className={`rounded-lg border px-3 py-2.5 text-sm ${
                cod4Files?.ready
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : cod4Files || cod4FilesError
                    ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                    : 'border-gray-500/30 text-gray-500 dark:text-gray-400'
              }`}
            >
              {!cod4Files && !cod4FilesError && 'Checking the CoD4 files…'}
              {cod4FilesError && cod4FilesError}
              {cod4Files?.ready && (
                <>Game files from <code>{cod4Files.folder}</code>: ready, nothing is downloaded.</>
              )}
              {cod4Files && !cod4Files.ready && (
                <>
                  <p className="font-semibold">The server cannot be installed yet:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {cod4Files.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </>
              )}
              {!cod4Files?.ready && (cod4Files || cod4FilesError) && (
                <button type="button" onClick={checkCod4Files} className="mt-2 text-xs font-semibold underline">
                  Check again
                </button>
              )}
            </div>
          )}

          {showProjectZomboidFields && (
            <>
              <div>
                <div className="mb-2 flex">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Branch
                    <InfoTip text="Pick a Steam branch. Changing branch later can corrupt an existing world, so this is an install-time choice." />
                  </span>
                </div>

                <AppSelect
                  className="gp-game-config-select gp-pz-branch-select"
                  value={pzBranch.trim()}
                  onChange={(v) => setPzBranch(v)}
                  options={branchOptions}
                  placeholder="Select a branch"
                />
              </div>

              <div>
                <div className="mb-2 flex">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Admin Password
                    <InfoTip text="In-game admin account password (to run privileged console commands). This is not the server join password. Leave empty to let the panel generate one. You can change it later in Container Settings." />
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showAdminPw ? 'text' : 'password'}
                      value={pzAdminPassword ?? ''}
                      onChange={(e) => setPzAdminPassword(e.target.value)}
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
                    onClick={() => setPzAdminPassword(generatePalworldAdminPassword())}
                    className="flex-shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            </>
          )}

          {showRustFields && (
            <>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  RCON Password
                  <InfoTip text="Used by the panel console (WebRCON)." />
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showRconPw ? 'text' : 'password'}
                      value={rustRcon}
                      onChange={(e) => setRustRcon(e.target.value)}
                      placeholder="At least 8 characters"
                      spellCheck={false}
                      autoComplete="off"
                      className={`${inputCls} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRconPw((v) => !v)}
                      aria-label={showRconPw ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                      {showRconPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRustRcon(generatePalworldAdminPassword())}
                    className="flex-shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                  >
                    Regenerate
                  </button>
                </div>
                {rustRconTooShort && (
                  <p className="mt-1.5 text-xs text-red-400">
                    Must be at least 8 characters.
                  </p>
                )}
              </div>
            </>
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
                javaImages={pickerJavaImages}
                onJavaImageChange={onPickerJavaImageChange}
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
            <AppButton tone="primary" onClick={onConfirm} disabled={loading || !serverName.trim() || eulaBlocked || rustRconTooShort || valheimPasswordTooShort || cod4SlotsInvalid || cod4RconInvalid || cod4FilesBlocked}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? 'Installing…' : 'Install'}
              <ArrowRight className="w-4 h-4" />
            </AppButton>
          </div>
        </div>
       </div>
      </div>
    </div>
  );
}

const LGSM_FEATURED = [
  '7 days to die', 'ark:', 'arma reforger', 'dayz',
  'garry', 'humanitz', 'palworld', 'project zomboid',
  'rust', 'satisfactory', 'team fortress 2', 'teamspeak 3', 'valheim',
];

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

  const [unifiedSearch, setUnifiedSearch] = useState('');
  const [showExternal, setShowExternal] = useState(false);
  const [installWasExternal, setInstallWasExternal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionModalImages, setVersionModalImages] = useState<OvhcloudImage[]>([]);

  const [lgsmGames, setLgsmGames] = useState<LinuxGsmGame[]>([]);
  const [lgsmLoading, setLgsmLoading] = useState(false);
  const [lgsmError, setLgsmError] = useState<string | null>(null);
  const [lgsmFlags, setLgsmFlags] = useState<Record<string, { steamCred: boolean; gameCopy: boolean }>>({});

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
  const [showValheim, setShowValheim] = useState(false);
  const [showProjectZomboid, setShowProjectZomboid] = useState(false);
  const [showRust, setShowRust] = useState(false);
  const [showCod4, setShowCod4] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [mountRows, setMountRows] = useState<MountRow[]>([]);
  const [healthcheckFromCatalog, setHealthcheckFromCatalog] = useState<Record<string, unknown> | null>(null);
  const [healthcheckEdit, setHealthcheckEdit] = useState<Record<string, unknown> | null>(null);
  const [requireSteamCredentials, setRequireSteamCredentials] = useState(false);
  const [requireGameCopy, setRequireGameCopy] = useState(false);
  const [steamUsername, setSteamUsername] = useState('');
  const [steamPassword, setSteamPassword] = useState('');
  const [pendingPayloadBase, setPendingPayloadBase] = useState<Partial<InstallGameHandlerPayload> | null>(null);

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

  const [configMcServerType, setConfigMcServerType] = useState<McServerType | null>(null);
  const [pickerInitialEnv, setPickerInitialEnv] = useState<Record<string, string>>({});
  const [pickerEnv, setPickerEnv] = useState<Record<string, string>>({});
  const [pickerJavaImages, setPickerJavaImages] = useState<JavaImageOption[]>([]);

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
    setShowProjectZomboid(false);
    setShowRust(false);
    setShowValheim(false);
    setShowCod4(false);
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
    setPickerJavaImages([]);
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
    setPickerJavaImages(minecraftJavaVariants(image.imageId));
    setPickerInitialEnv({});
    setPickerEnv(initialPicker);
    setConfigTitle(`Install ${image.name}`);
    setConfigSubtitle('');
    setConfigProvider('ovhcloud');
    setServerName(makeUniqueServerName(`${image.name} Server`, usedServerNames));
    setTcpPorts(ports.tcp);
    setUdpPorts(ports.udp);
    const baseEnv = envFromImage(image);
    setEnvRows(
      image.family === 'palworld'
        ? [...baseEnv, { key: 'PALWORLD_ADMIN_PASSWORD', value: generatePalworldAdminPassword() }]
        : image.family === 'project-zomboid'
          ? [...baseEnv, { key: 'PZ_ADMIN_PASSWORD', value: generatePalworldAdminPassword() }]
          : image.family === 'rust'
            ? [...baseEnv, { key: 'RUST_RCON_PASSWORD', value: generatePalworldAdminPassword() }]
            : image.family === 'valheim'
              ? [...baseEnv, { key: 'VALHEIM_SERVER_PASSWORD', value: generatePalworldAdminPassword() }]
              : baseEnv
    );
    setConfigShowEnv(true);
    setConfigRequireEula(image.requiredEnvKeys.includes('EULA'));
    setShowHytale(image.supportsHytaleOptions);
    setHytaleOptions({ patchline: '', profileUuid: '' });
    setShowPalworldAdmin(image.family === 'palworld');
    setShowProjectZomboid(image.family === 'project-zomboid');
    setShowRust(image.family === 'rust');
    setShowValheim(image.family === 'valheim');
    setConfigError(null);
    const needsBackupMount =
      image.family === 'minecraft' || image.family === 'project-zomboid' || image.family === 'rust';
    setMountRows(
      needsBackupMount
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

  const handlePickerJavaImage = (img: { imageId: string; dockerImage: string }) =>
    setPendingPayloadBase((prev) => (prev ? { ...prev, imageId: img.imageId, dockerImage: img.dockerImage } : prev));

  const openLgsmConfig = async (game: LinuxGsmGame) => {
    resetConfigState();
    setConfigTitle(`Install ${game.gamename}`);
    setConfigSubtitle('');
    setConfigProvider('linuxgsm');
    setShowCod4(game.shortname === 'cod4');
    setServerName(makeUniqueServerName(`${game.gamename} Server`, usedServerNames));
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
    const uniqueName = makeUniqueServerName(serverName.trim(), usedServerNames);
    const payload: InstallGameHandlerPayload = {
      ...pendingPayloadBase as any,
      name: uniqueName,
      ports: { tcp: parsePortRows(tcpPorts), udp: parsePortRows(udpPorts) },
      healthcheck: healthcheckEdit as any ?? null,
      mounts: mountRows.filter((m) => m.key.trim() && m.containerPath.trim()),
      env: configShowEnv ? { ...pickerEnv, ...envRowsToRecord(envRows) } : undefined,
      ...(showHytale ? { imageOptions: { patchline: hytaleOptions.patchline || undefined, profileUuid: hytaleOptions.profileUuid || null } } : {}),
      ...(isLgsm && requireSteamCredentials ? { requireSteamCredentials: true, steamUsername: steamUsername.trim(), steamPassword: steamPassword } : {}),
      resourceLimits: (cpuVal > 0 || memVal > 0) ? { cpu: cpuVal > 0 ? cpuVal : 0, memoryMb: memVal > 0 ? memVal : 0 } : null,
    };
    setInstallWasExternal(false);
    setInstallingName(uniqueName);
    setShowConfig(false);
    setShowInstallModal(true);
    onClose();
    await onInstall(payload);
  };

  const handleExternalInstall = async () => {
    setExtError(null);
    if (!extDockerImage.trim()) { setExtError('Docker image is required.'); return; }
    if (!extServerName.trim()) { setExtError('Server name is required.'); return; }
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
    const uniqueExtName = makeUniqueServerName(extServerName.trim(), usedServerNames);
    const payload: InstallGameHandlerPayload = {
      provider: 'external',
      name: uniqueExtName,
      dockerImage: extDockerImage.trim(),
      ports: { tcp: parsePortRows(extTcpPorts), udp: parsePortRows(extUdpPorts) },
      healthcheck: extHealthcheck as any ?? null,
      env: envRowsToRecord(extEnvRows),
      mounts: extMountRows.filter((m) => m.key.trim() && m.containerPath.trim()),
      runtimeIdentity: { user: extRuntimeUser.trim(), uid: runtimeUid, gid: runtimeGid },
      resourceLimits: (extCpuVal > 0 || extMemVal > 0) ? { cpu: extCpuVal > 0 ? extCpuVal : 0, memoryMb: extMemVal > 0 ? extMemVal : 0 } : null,
    };
    setInstallWasExternal(true);
    setInstallingName(uniqueExtName);
    setShowInstallModal(true);
    onClose();
    await onInstall(payload);
  };

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

            <div className="flex-1 flex flex-col overflow-hidden">

              {!showExternal && (
                <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
                  <div className="space-y-4">

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

                    {lgsmLoading && (
                      <div className="flex items-center justify-center py-10">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-8 h-8 rounded-full border-2 border-[var(--gp-ods-accent-primary)] dark:border-white/30 border-t-transparent animate-spin" />
                          <p className="text-sm text-gray-500 dark:text-gray-400">Loading games…</p>
                        </div>
                      </div>
                    )}

                    {lgsmError && !lgsmLoading && (
                      <div className="flex items-center justify-center py-4">
                        <p className="text-sm text-red-400">{lgsmError}</p>
                      </div>
                    )}

                    {noResults && (
                      <div className="flex flex-col items-center justify-center py-12 gap-2">
                        <Search className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">No games found for "{unifiedSearch}"</p>
                      </div>
                    )}

                    {!lgsmLoading && !noResults && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">

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
                          <input type="text" value={extServerName}
                            onChange={(e) => setExtServerName(makeUniqueServerName(e.target.value, usedServerNames))}
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
          showProjectZomboidFields={showProjectZomboid}
          showRustFields={showRust}
          showValheimFields={showValheim}
          showCod4Fields={showCod4}
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
          pickerJavaImages={pickerJavaImages}
          onPickerJavaImageChange={handlePickerJavaImage}
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
