import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Save, AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react';
import { AppButton } from '../../src/ui/components';
import { apiClient } from '../../utils/api';

type PortEntry = { host: string; container: string; label: string };
type EnvEntry = { key: string; value: string };
type MountEntry = { key: string; containerPath: string };
type HealthcheckMode = 'image_default' | 'disabled' | 'override';
type HealthcheckOverrideType = 'tcp_connect' | 'process' | 'command';

interface HealthcheckState {
  mode: HealthcheckMode;
  overrideType: HealthcheckOverrideType;
  port: string;
  processName: string;
  command: string;
  intervalSeconds: string;
  timeoutSeconds: string;
  startPeriodSeconds: string;
  retries: string;
}

// Statuses that require a "restart needed" confirmation before saving container config.
// 'installing' is intentionally excluded: the container will be recreated at end of install anyway.
const RUNNING_STATUSES = new Set(['running', 'starting', 'stopping', 'restarting', 'unhealthy']);

interface ContainerConfigTabProps {
  serverId?: number | null;
  serverStatus?: string | null;
  borderColor: string;
  contentBg: string;
  inputBg: string;
  inputBorder: string;
  textPrimary: string;
  textSecondary: string;
  hoverBg: string;
  canEdit: boolean;
  /** Whether the caller holds `server.env`; when false the env editor is hidden and env is omitted on save. */
  canManageEnv: boolean;
  pickerManagedKeys?: string[];
  onSaved?: () => void;
}

function parseField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

function envToEntries(raw: unknown): EnvEntry[] {
  const parsed = parseField<any>(raw, {});
  if (Array.isArray(parsed)) {
    // Backend format: ["KEY=VALUE", ...]
    return (parsed as string[]).map((item) => {
      const idx = item.indexOf('=');
      return idx >= 0
        ? { key: item.slice(0, idx), value: item.slice(idx + 1) }
        : { key: item, value: '' };
    });
  }
  if (typeof parsed === 'object' && parsed !== null) {
    return Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) }));
  }
  return [];
}

function entriesToEnv(entries: EnvEntry[]): Record<string, string> {
  return Object.fromEntries(entries.filter(e => e.key.trim()).map(e => [e.key.trim(), e.value]));
}

function parseHealthcheck(raw: unknown): HealthcheckState {
  const defaults: HealthcheckState = {
    mode: 'image_default',
    overrideType: 'tcp_connect',
    port: '',
    processName: '',
    command: '',
    intervalSeconds: '30',
    timeoutSeconds: '10',
    startPeriodSeconds: '60',
    retries: '3',
  };
  const parsed = parseField<any>(raw, null);
  if (!parsed || parsed.mode === 'image_default') return defaults;
  if (parsed.mode === 'disabled') return { ...defaults, mode: 'disabled' };
  if (parsed.mode === 'override') {
    // Backend stores normalized format: { probe: { type, port/name/command }, intervalSeconds, ... }
    // Frontend sends flat format: { type, port/name/command, intervalSeconds, ... }
    const probe = parsed.probe ?? parsed;
    const cmdRaw = probe.command;
    return {
      mode: 'override',
      overrideType: probe.type ?? 'tcp_connect',
      port: String(probe.port ?? ''),
      processName: probe.name ?? '',
      command: Array.isArray(cmdRaw) ? cmdRaw.join(' ') : (cmdRaw ?? ''),
      intervalSeconds: String(parsed.intervalSeconds ?? '30'),
      timeoutSeconds: String(parsed.timeoutSeconds ?? '10'),
      startPeriodSeconds: String(parsed.startPeriodSeconds ?? '60'),
      retries: String(parsed.retries ?? '3'),
    };
  }
  return defaults;
}

function buildHealthcheckPayload(hc: HealthcheckState): { mode: string; [k: string]: unknown } | null {
  if (hc.mode === 'image_default') return { mode: 'image_default' };
  if (hc.mode === 'disabled') return { mode: 'disabled' };
  const base = {
    mode: 'override' as const,
    type: hc.overrideType,
    intervalSeconds: Number(hc.intervalSeconds) || 30,
    timeoutSeconds: Number(hc.timeoutSeconds) || 10,
    startPeriodSeconds: Number(hc.startPeriodSeconds) || 60,
    retries: Number(hc.retries) || 3,
  };
  if (hc.overrideType === 'tcp_connect') return { ...base, port: Number(hc.port) };
  if (hc.overrideType === 'process') return { ...base, name: hc.processName };
  return { ...base, command: hc.command.trim().split(/\s+/).filter(Boolean) };
}

function portsFromRaw(raw: unknown): { tcp: PortEntry[]; udp: PortEntry[] } {
  const parsed = parseField<any>(raw, { tcp: [], udp: [] });
  const toEntries = (arr: any[]): PortEntry[] =>
    (Array.isArray(arr) ? arr : []).map((e: any) => ({
      host: String(e.host ?? ''),
      container: String(e.container ?? ''),
      label: e.label ?? '',
    }));
  return {
    tcp: toEntries(parsed?.tcp ?? []),
    udp: toEntries(parsed?.udp ?? []),
  };
}

function mountsFromRaw(raw: unknown): MountEntry[] {
  const parsed = parseField<any[]>(raw, []);
  return (Array.isArray(parsed) ? parsed : []).map((m: any) => ({
    key: m.key ?? '',
    containerPath: m.containerPath ?? '',
  }));
}

const inputClass =
  'w-full rounded bg-[#1f2937] border border-gray-600 text-white text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--gp-primary-300)] disabled:opacity-50';

const sectionClass = 'space-y-3';

export function ContainerConfigTab({
  serverId,
  serverStatus,
  borderColor,
  contentBg,
  textPrimary,
  textSecondary,
  canEdit,
  canManageEnv,
  onSaved,
}: ContainerConfigTabProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  const [dockerImage, setDockerImage] = useState('');
  const [tcpPorts, setTcpPorts] = useState<PortEntry[]>([]);
  const [udpPorts, setUdpPorts] = useState<PortEntry[]>([]);
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([]);
  const [mounts, setMounts] = useState<MountEntry[]>([]);
  const [healthcheck, setHealthcheck] = useState<HealthcheckState>(() => parseHealthcheck(null));
  const [cpuLimit, setCpuLimit] = useState('');
  const [memoryLimitMb, setMemoryLimitMb] = useState('');

  const [savedTcpPorts, setSavedTcpPorts] = useState<PortEntry[]>([]);
  const [savedUdpPorts, setSavedUdpPorts] = useState<PortEntry[]>([]);
  const [savedEnvEntries, setSavedEnvEntries] = useState<EnvEntry[]>([]);
  const [savedMounts, setSavedMounts] = useState<MountEntry[]>([]);
  const [savedHealthcheck, setSavedHealthcheck] = useState<HealthcheckState>(() => parseHealthcheck(null));
  const [savedCpuLimit, setSavedCpuLimit] = useState('');
  const [savedMemoryLimitMb, setSavedMemoryLimitMb] = useState('');

  const hasChanges = useMemo(() => (
    JSON.stringify(tcpPorts) !== JSON.stringify(savedTcpPorts) ||
    JSON.stringify(udpPorts) !== JSON.stringify(savedUdpPorts) ||
    JSON.stringify(envEntries) !== JSON.stringify(savedEnvEntries) ||
    JSON.stringify(mounts) !== JSON.stringify(savedMounts) ||
    JSON.stringify(healthcheck) !== JSON.stringify(savedHealthcheck) ||
    cpuLimit !== savedCpuLimit ||
    memoryLimitMb !== savedMemoryLimitMb
  ), [tcpPorts, udpPorts, envEntries, mounts, healthcheck, cpuLimit, memoryLimitMb, savedTcpPorts, savedUdpPorts, savedEnvEntries, savedMounts, savedHealthcheck, savedCpuLimit, savedMemoryLimitMb]);

  const applyLoaded = (raw: any) => {
    setDockerImage(raw?.dockerImage ?? '');
    const ports = portsFromRaw(raw?.ports);
    const env = envToEntries(raw?.env);
    const mnts = mountsFromRaw(raw?.mounts);
    const hc = parseHealthcheck(raw?.healthcheck);
    const rl = raw?.resourceLimits ?? null;
    const cpu = rl?.cpu != null ? String(rl.cpu) : '';
    const mem = rl?.memoryMb != null ? String(rl.memoryMb) : '';
    setTcpPorts(ports.tcp);   setSavedTcpPorts(ports.tcp);
    setUdpPorts(ports.udp);   setSavedUdpPorts(ports.udp);
    setEnvEntries(env);       setSavedEnvEntries(env);
    setMounts(mnts);          setSavedMounts(mnts);
    setHealthcheck(hc);       setSavedHealthcheck(hc);
    setCpuLimit(cpu);         setSavedCpuLimit(cpu);
    setMemoryLimitMb(mem);    setSavedMemoryLimitMb(mem);
  };

  useEffect(() => {
    if (!serverId) return;
    setLoading(true);
    setError(null);

    apiClient
      .getServer(serverId)
      .then(applyLoaded)
      .catch((err: any) => {
        setError(err?.response?.data?.error || err?.message || 'Failed to load server config');
      })
      .finally(() => setLoading(false));
  }, [serverId]);

  const handleSave = async () => {
    if (!serverId || !canEdit) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    const cpuVal = parseFloat(cpuLimit);
    const memVal = parseInt(memoryLimitMb, 10);
    const payload: any = {
      ports: {
        tcp: tcpPorts
          .filter(p => p.host && p.container)
          .map(p => ({ host: Number(p.host), container: Number(p.container), label: p.label })),
        udp: udpPorts
          .filter(p => p.host && p.container)
          .map(p => ({ host: Number(p.host), container: Number(p.container), label: p.label })),
      },
      mounts: mounts.filter(m => m.key && m.containerPath),
      healthcheck: buildHealthcheckPayload(healthcheck),
      resourceLimits: (cpuVal > 0 || memVal > 0) ? { cpu: cpuVal > 0 ? cpuVal : 0, memoryMb: memVal > 0 ? memVal : 0 } : null,
    };

    // Only send env with `server.env`; otherwise the loaded env is redacted to `{}`.
    if (canManageEnv) {
      payload.env = entriesToEnv(envEntries);
    }

    try {
      await apiClient.updateServer(serverId, payload);
      setSavedTcpPorts(tcpPorts);
      setSavedUdpPorts(udpPorts);
      setSavedEnvEntries(envEntries);
      setSavedMounts(mounts);
      setSavedHealthcheck(healthcheck);
      setSavedCpuLimit(cpuLimit);
      setSavedMemoryLimitMb(memoryLimitMb);
      setSuccess(true);
      onSaved?.();
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const addPort = (protocol: 'tcp' | 'udp') => {
    const entry: PortEntry = { host: '', container: '', label: '' };
    if (protocol === 'tcp') setTcpPorts(p => [...p, entry]);
    else setUdpPorts(p => [...p, entry]);
  };

  const updatePort = (protocol: 'tcp' | 'udp', idx: number, field: keyof PortEntry, val: string) => {
    const setter = protocol === 'tcp' ? setTcpPorts : setUdpPorts;
    setter(prev => prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p)));
  };

  const removePort = (protocol: 'tcp' | 'udp', idx: number) => {
    const setter = protocol === 'tcp' ? setTcpPorts : setUdpPorts;
    setter(prev => prev.filter((_, i) => i !== idx));
  };

  const addEnv = () => setEnvEntries(e => [...e, { key: '', value: '' }]);
  const updateEnv = (idx: number, field: keyof EnvEntry, val: string) =>
    setEnvEntries(prev => prev.map((e, i) => (i === idx ? { ...e, [field]: val } : e)));
  const removeEnv = (idx: number) => setEnvEntries(prev => prev.filter((_, i) => i !== idx));

  const addMount = () => setMounts(m => [...m, { key: '', containerPath: '' }]);
  const updateMount = (idx: number, field: keyof MountEntry, val: string) =>
    setMounts(prev => prev.map((m, i) => (i === idx ? { ...m, [field]: val } : m)));
  const removeMount = (idx: number) => setMounts(prev => prev.filter((_, i) => i !== idx));

  const setHc = (patch: Partial<HealthcheckState>) =>
    setHealthcheck(prev => ({ ...prev, ...patch }));

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h3 className={`text-2xl font-bold ${textPrimary} mb-1`}>Container Config</h3>
          <p className={`text-sm ${textSecondary}`}>
            Ports, environment variables, mounts and healthcheck. Saving will recreate the Docker container.
          </p>
        </div>


        {/* Docker Image (informational — read-only, shown first) */}
        {dockerImage && (
          <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-6`}>
            <h4 className={`text-base font-semibold ${textPrimary} mb-3`}>Docker Image</h4>
            <code className="block w-full rounded bg-[#1f2937] text-gray-400 text-sm px-3 py-2 font-mono break-all select-all">
              {dockerImage}
            </code>
          </div>
        )}

        {/* Ports */}
        <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-6`}>
          <h4 className={`text-base font-semibold ${textPrimary} mb-4`}>Ports</h4>

          <div className="space-y-5">
            <PortsSection
              label="TCP"
              ports={tcpPorts}
              protocol="tcp"
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              canEdit={canEdit}
              onAdd={() => addPort('tcp')}
              onUpdate={(idx, field, val) => updatePort('tcp', idx, field, val)}
              onRemove={idx => removePort('tcp', idx)}
            />
            <PortsSection
              label="UDP"
              ports={udpPorts}
              protocol="udp"
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              canEdit={canEdit}
              onAdd={() => addPort('udp')}
              onUpdate={(idx, field, val) => updatePort('udp', idx, field, val)}
              onRemove={idx => removePort('udp', idx)}
            />
          </div>
        </div>

        {/* Volumes */}
        <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-6`}>
          <h4 className={`text-base font-semibold ${textPrimary} mb-4`}>Volumes</h4>
          <div className={sectionClass}>
            {mounts.length === 0 && (
              <p className={`text-sm ${textSecondary}`}>No mounts configured.</p>
            )}
            {mounts.length > 0 && (
              <div className="flex gap-2 items-center">
                <span className={`flex-1 text-xs font-medium ${textSecondary}`}>Name</span>
                <span className="text-sm flex-shrink-0 invisible">→</span>
                <span className={`flex-[2] text-xs font-medium ${textSecondary}`}>Container path</span>
                {canEdit && (
                  <span className="p-1.5 flex-shrink-0 invisible" aria-hidden><Trash2 className="w-4 h-4" /></span>
                )}
              </div>
            )}
            {mounts.map((mount, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  className={`${inputClass} flex-1`}
                  placeholder="key (e.g. data)"
                  value={mount.key}
                  onChange={e => updateMount(idx, 'key', e.target.value)}
                  disabled={!canEdit}
                />
                <span className={`text-sm ${textSecondary} flex-shrink-0`}>→</span>
                <input
                  className={`${inputClass} flex-[2]`}
                  placeholder="containerPath (e.g. /data)"
                  value={mount.containerPath}
                  onChange={e => updateMount(idx, 'containerPath', e.target.value)}
                  disabled={!canEdit}
                />
                {canEdit && (
                  <AppButton
                    tone="ghost"
                    onClick={() => removeMount(idx)}
                    className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </AppButton>
                )}
              </div>
            ))}
            {canEdit && (
              <AppButton
                tone="ghost"
                onClick={addMount}
                className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded border border-dashed ${borderColor} text-gray-400 hover:text-white hover:bg-gray-700 transition-colors`}
              >
                <Plus className="w-4 h-4" />
                Add volume
              </AppButton>
            )}
          </div>
        </div>

        {/* Environment Variables — only rendered with `server.env` */}
        {canManageEnv && (
        <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-6`}>
          <h4 className={`text-base font-semibold ${textPrimary} mb-4`}>Environment Variables</h4>
          <div className={sectionClass}>
            {envEntries.length === 0 && (
              <p className={`text-sm ${textSecondary}`}>No variables configured.</p>
            )}
            {envEntries.map((entry, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  className={`${inputClass} flex-1`}
                  placeholder="KEY"
                  value={entry.key}
                  onChange={e => updateEnv(idx, 'key', e.target.value)}
                  disabled={!canEdit}
                />
                <span className={`text-sm ${textSecondary} flex-shrink-0`}>=</span>
                <input
                  className={`${inputClass} flex-[2]`}
                  placeholder="value"
                  value={entry.value}
                  onChange={e => updateEnv(idx, 'value', e.target.value)}
                  disabled={!canEdit}
                />
                {canEdit && (
                  <AppButton
                    tone="ghost"
                    onClick={() => removeEnv(idx)}
                    className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </AppButton>
                )}
              </div>
            ))}
            {canEdit && (
              <AppButton
                tone="ghost"
                onClick={addEnv}
                className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded border border-dashed ${borderColor} text-gray-400 hover:text-white hover:bg-gray-700 transition-colors`}
              >
                <Plus className="w-4 h-4" />
                Add variable
              </AppButton>
            )}
          </div>
        </div>
        )}

        {/* Resource Limits */}
        <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-6`}>
          <h4 className={`text-base font-semibold ${textPrimary} mb-1`}>Resource Limits</h4>
          <p className={`text-xs ${textSecondary} mb-4`}>
            Leave blank for no limit. Changes apply immediately without restarting the server.
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`w-28 flex-shrink-0 text-sm ${textSecondary}`}>vCPU</span>
              <input
                type="number"
                min="0"
                step="0.1"
                className={`${inputClass} flex-1`}
                placeholder="e.g. 2"
                value={cpuLimit}
                onChange={e => setCpuLimit(e.target.value)}
                disabled={!canEdit}
              />
              {canEdit && cpuLimit && (
                <AppButton
                  tone="ghost"
                  onClick={() => setCpuLimit('')}
                  className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
                  title="Remove CPU limit"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </AppButton>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-28 flex-shrink-0 text-sm ${textSecondary}`}>RAM (MB)</span>
              <input
                type="number"
                min="0"
                step="128"
                className={`${inputClass} flex-1`}
                placeholder="e.g. 4096"
                value={memoryLimitMb}
                onChange={e => setMemoryLimitMb(e.target.value)}
                disabled={!canEdit}
              />
              {memoryLimitMb && !isNaN(Number(memoryLimitMb)) && Number(memoryLimitMb) > 0 && (
                <span className={`text-xs flex-shrink-0 ${textSecondary}`}>≈ {(Number(memoryLimitMb) / 1024).toFixed(1)} GB</span>
              )}
              {canEdit && memoryLimitMb && (
                <AppButton
                  tone="ghost"
                  onClick={() => setMemoryLimitMb('')}
                  className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
                  title="Remove RAM limit"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </AppButton>
              )}
            </div>
          </div>
        </div>

        {/* Healthcheck */}
        <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-6`}>
          <h4 className={`text-base font-semibold ${textPrimary} mb-4`}>Healthcheck</h4>
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-600 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>A wrong probe can leave the server stuck as <strong>unhealthy</strong> or never finish starting. Keep <strong>Image default</strong> unless you know the image&apos;s listening port or main process.</span>
            </div>
            <div>
              <label className={`block text-sm ${textSecondary} mb-1`}>Mode</label>
              <select
                className={`${inputClass}`}
                value={healthcheck.mode}
                onChange={e => setHc({ mode: e.target.value as HealthcheckMode })}
                disabled={!canEdit}
              >
                <option value="image_default">Image default</option>
                <option value="disabled">Disabled</option>
                <option value="override">Override</option>
              </select>
            </div>

            {healthcheck.mode === 'override' && (
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm ${textSecondary} mb-1`}>Type</label>
                  <select
                    className={`${inputClass}`}
                    value={healthcheck.overrideType}
                    onChange={e => setHc({ overrideType: e.target.value as HealthcheckOverrideType })}
                    disabled={!canEdit}
                  >
                    <option value="tcp_connect">TCP connect</option>
                    <option value="process">Process</option>
                    <option value="command">Command</option>
                  </select>
                </div>

                {healthcheck.overrideType === 'tcp_connect' && (
                  <div>
                    <label className={`block text-sm ${textSecondary} mb-1`}>Port</label>
                    <input
                      type="number"
                      className={inputClass}
                      placeholder="e.g. 25565"
                      value={healthcheck.port}
                      onChange={e => setHc({ port: e.target.value })}
                      disabled={!canEdit}
                    />
                  </div>
                )}

                {healthcheck.overrideType === 'process' && (
                  <div>
                    <label className={`block text-sm ${textSecondary} mb-1`}>Process name</label>
                    <input
                      className={inputClass}
                      placeholder="e.g. srcds"
                      value={healthcheck.processName}
                      onChange={e => setHc({ processName: e.target.value })}
                      disabled={!canEdit}
                    />
                  </div>
                )}

                {healthcheck.overrideType === 'command' && (
                  <div>
                    <label className={`block text-sm ${textSecondary} mb-1`}>Command (space-separated args)</label>
                    <input
                      className={inputClass}
                      placeholder='e.g. curl -f http://localhost:8080/health'
                      value={healthcheck.command}
                      onChange={e => setHc({ command: e.target.value })}
                      disabled={!canEdit}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-sm ${textSecondary} mb-1`}>Interval (s)</label>
                    <input
                      type="number"
                      className={inputClass}
                      value={healthcheck.intervalSeconds}
                      onChange={e => setHc({ intervalSeconds: e.target.value })}
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm ${textSecondary} mb-1`}>Timeout (s)</label>
                    <input
                      type="number"
                      className={inputClass}
                      value={healthcheck.timeoutSeconds}
                      onChange={e => setHc({ timeoutSeconds: e.target.value })}
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm ${textSecondary} mb-1`}>Start period (s)</label>
                    <input
                      type="number"
                      className={inputClass}
                      value={healthcheck.startPeriodSeconds}
                      onChange={e => setHc({ startPeriodSeconds: e.target.value })}
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm ${textSecondary} mb-1`}>Retries</label>
                    <input
                      type="number"
                      className={inputClass}
                      value={healthcheck.retries}
                      onChange={e => setHc({ retries: e.target.value })}
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="text-sm text-green-400 bg-green-400/10 border border-green-400/30 rounded-lg px-4 py-3">
            Container config saved. The container will be recreated.
          </div>
        )}
        {canEdit && (
          <div className="flex justify-end pb-4">
            <AppButton
              tone="primary"
              onClick={() => RUNNING_STATUSES.has(serverStatus ?? '') ? setShowRestartConfirm(true) : void handleSave()}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save container config'}
            </AppButton>
          </div>
        )}
      </div>

      {showRestartConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className={`${contentBg} border ${borderColor} w-full max-w-md rounded-xl shadow-2xl`}>
            <div className={`flex items-center justify-between border-b ${borderColor} px-6 py-4`}>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15">
                  <RefreshCw className="h-4 w-4 text-amber-500" />
                </div>
                <h3 className={`text-base font-semibold ${textPrimary}`}>Restart required</h3>
              </div>
              <AppButton
                onClick={() => setShowRestartConfirm(false)}
                className={`rounded-md p-1.5 transition-colors ${textSecondary} hover:bg-gray-100 dark:hover:bg-white/10`}
              >
                <X className="h-4 w-4" />
              </AppButton>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className={`text-sm ${textSecondary}`}>
                Saving the container configuration will <span className={`font-medium ${textPrimary}`}>immediately restart the server</span>. Any ongoing game session will be interrupted.
              </p>
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Make sure players are warned before proceeding.</span>
              </div>
            </div>

            <div className={`flex justify-end gap-3 border-t ${borderColor} px-6 py-4`}>
              <AppButton
                onClick={() => setShowRestartConfirm(false)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${textSecondary} hover:bg-gray-100 dark:hover:bg-white/10`}
              >
                Cancel
              </AppButton>
              <AppButton
                onClick={() => { setShowRestartConfirm(false); void handleSave(); }}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Confirm &amp; restart
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PortsSectionProps {
  label: string;
  ports: PortEntry[];
  protocol: 'tcp' | 'udp';
  textPrimary: string;
  textSecondary: string;
  canEdit: boolean;
  onAdd: () => void;
  onUpdate: (idx: number, field: keyof PortEntry, val: string) => void;
  onRemove: (idx: number) => void;
}

function PortsSection({
  label,
  ports,
  textPrimary,
  textSecondary,
  canEdit,
  onAdd,
  onUpdate,
  onRemove,
}: PortsSectionProps) {
  return (
    <div>
      <p className={`text-sm font-medium ${textPrimary} mb-2`}>{label}</p>
      <div className="space-y-2">
        {ports.length === 0 && (
          <p className={`text-sm ${textSecondary}`}>No {label} ports.</p>
        )}
        {ports.length > 0 && (
          <div className="flex gap-2 items-center">
            <span className={`flex-1 text-xs font-medium ${textSecondary}`}>Host port</span>
            <span className="text-sm flex-shrink-0 invisible">:</span>
            <span className={`flex-1 text-xs font-medium ${textSecondary}`}>Container port</span>
            <span className={`flex-1 text-xs font-medium ${textSecondary}`}>Name</span>
            {canEdit && (
              <span className="p-1.5 flex-shrink-0 invisible" aria-hidden><Trash2 className="w-4 h-4" /></span>
            )}
          </div>
        )}
        {ports.map((port, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="number"
              className={`${inputClass} flex-1`}
              placeholder="Host port"
              value={port.host}
              onChange={e => onUpdate(idx, 'host', e.target.value)}
              disabled={!canEdit}
            />
            <span className={`text-sm ${textSecondary} flex-shrink-0`}>:</span>
            <input
              type="number"
              className={`${inputClass} flex-1`}
              placeholder="Container port"
              value={port.container}
              onChange={e => onUpdate(idx, 'container', e.target.value)}
              disabled={!canEdit}
            />
            <input
              className={`${inputClass} flex-1`}
              placeholder="label"
              value={port.label}
              onChange={e => onUpdate(idx, 'label', e.target.value)}
              disabled={!canEdit}
            />
            {canEdit && (
              <AppButton
                tone="ghost"
                onClick={() => onRemove(idx)}
                className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700 flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </AppButton>
            )}
          </div>
        ))}
        {canEdit && (
          <AppButton
            tone="ghost"
            onClick={onAdd}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors px-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add {label} port
          </AppButton>
        )}
      </div>
    </div>
  );
}
