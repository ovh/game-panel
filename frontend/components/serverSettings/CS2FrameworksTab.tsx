import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Terminal } from 'lucide-react';
import { AppButton } from '../../src/ui/components';
import { apiClient } from '../../utils/api';
import {
  fetchCounterStrikeSharpVersions,
  fetchMetamodVersions,
  type FrameworkVersion,
} from '../../utils/frameworkCatalog';
import { mapBackendStatusToUi } from '../../utils/serverRuntime';

// ── Types ──────────────────────────────────────────────────────────────────

interface FrameworkStatus {
  metamodInstalled: boolean;
  counterStrikeSharpInstalled: boolean;
}

interface ScriptResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  restarted: boolean;
}

export interface CS2FrameworksSectionProps {
  serverId: number;
  serverStatus?: string | null;
  canWrite: boolean;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
  textSecondary: string;
}

type VersionLoadStatus = 'loading' | 'loaded' | 'failed';

const selectCls =
  'w-full rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20 focus:border-transparent disabled:opacity-50 transition-all appearance-none cursor-pointer';

const versionInputCls =
  'w-full rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20 focus:border-transparent disabled:opacity-50 transition-all';

// ── Sub-components ─────────────────────────────────────────────────────────

function VersionSelect({
  status,
  versions,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  status: VersionLoadStatus;
  versions: FrameworkVersion[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  return (
    <div className="w-full">
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Version</label>
      {status === 'loading' && (
        <div className="h-9 rounded-lg bg-gray-200 dark:bg-gray-700/50 animate-pulse" />
      )}
      {status === 'failed' && (
        <>
          <div className="flex items-center gap-1.5 text-xs text-amber-500 dark:text-amber-400 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Could not load versions — enter one manually
          </div>
          <input
            className={versionInputCls}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        </>
      )}
      {status === 'loaded' && (
        <div className="relative">
          <select
            className={selectCls}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          >
            {versions.map((v, i) => (
              <option key={v.version} value={v.version}>
                {v.version}{i === 0 ? ' (Latest)' : ''}{v.type === 'pre-release' ? ' [pre-release]' : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
      active
        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
        : 'bg-gray-500/10 text-gray-400 border border-gray-600/40'
    }`}>
      {active
        ? <Check className="w-3 h-3" />
        : <span className="w-3 h-3 rounded-full border border-current opacity-50 inline-block" />
      }
      {label}
    </span>
  );
}

function LogOutput({ result }: { result: ScriptResult | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!result) return null;
  const combined = [result.stdout, result.stderr].filter(Boolean).join('\n');
  return (
    <div className="mt-3 space-y-1.5">
      <div className={`flex items-center gap-2 text-xs font-medium ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>
        {result.ok ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
        {result.ok
          ? `Done${result.restarted ? ' — server restarted' : ''}`
          : `Failed (exit code ${result.exitCode})`
        }
      </div>
      {combined && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 transition-colors"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Terminal className="w-3 h-3" />
            {expanded ? 'Hide output' : 'Show output'}
          </button>
          {expanded && (
            <pre className="text-[11px] font-mono bg-gray-950 border border-gray-700/60 rounded-lg p-3 max-h-48 overflow-auto text-gray-300 whitespace-pre-wrap break-all">
              {combined}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function CS2FrameworksSection({
  serverId,
  serverStatus,
  canWrite,
  borderColor,
  contentBg,
  textPrimary,
  textSecondary,
}: CS2FrameworksSectionProps) {
  // Framework install/repair restarts the server, so it is blocked while the
  // container is active/transitioning (allowed on stopped, unhealthy, failed).
  const FRAMEWORK_BLOCKED_STATUSES = ['creating', 'installing', 'starting', 'running', 'stopping', 'restarting'];
  const isStopped = !FRAMEWORK_BLOCKED_STATUSES.includes(mapBackendStatusToUi(serverStatus));
  const [status, setStatus] = useState<FrameworkStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [metamodInstalling, setMetamodInstalling] = useState(false);
  const [metamodResult, setMetamodResult] = useState<ScriptResult | null>(null);
  const [metamodError, setMetamodError] = useState<string | null>(null);

  const [cssInstalling, setCssInstalling] = useState(false);
  const [cssResult, setCssResult] = useState<ScriptResult | null>(null);
  const [cssError, setCssError] = useState<string | null>(null);

  const [metamodVersions, setMetamodVersions] = useState<FrameworkVersion[]>([]);
  const [metamodVersionsStatus, setMetamodVersionsStatus] = useState<VersionLoadStatus>('loading');
  const [metamodVersion, setMetamodVersion] = useState('');

  const [cssVersions, setCssVersions] = useState<FrameworkVersion[]>([]);
  const [cssVersionsStatus, setCssVersionsStatus] = useState<VersionLoadStatus>('loading');
  const [cssVersion, setCssVersion] = useState('');

  const loaded = useRef(false);
  const versionsLoaded = useRef(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiClient.getCS2Frameworks(serverId);
      setStatus(data.frameworks);
    } catch (err: any) {
      setLoadError(err?.response?.data?.error || err?.message || 'Failed to load framework status.');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (versionsLoaded.current) return;
    versionsLoaded.current = true;
    let cancelled = false;

    void (async () => {
      const [metamod, css] = await Promise.all([
        fetchMetamodVersions(),
        fetchCounterStrikeSharpVersions(),
      ]);
      if (cancelled) return;

      if (metamod && metamod.length > 0) {
        setMetamodVersions(metamod);
        setMetamodVersion(metamod[0].version);
        setMetamodVersionsStatus('loaded');
      } else {
        setMetamodVersionsStatus('failed');
      }

      if (css && css.length > 0) {
        setCssVersions(css);
        setCssVersion(css[0].version);
        setCssVersionsStatus('loaded');
      } else {
        setCssVersionsStatus('failed');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const installMetamod = async () => {
    if (!canWrite || metamodInstalling) return;
    setMetamodInstalling(true);
    setMetamodError(null);
    setMetamodResult(null);
    try {
      const version = metamodVersion.trim();
      const result = await apiClient.installCS2Metamod(serverId, version ? { version } : undefined);
      setMetamodResult(result);
      if (result.ok) await loadStatus();
    } catch (err: any) {
      setMetamodError(err?.response?.data?.error || err?.message || 'Installation failed.');
    } finally {
      setMetamodInstalling(false);
    }
  };

  const installCSS = async () => {
    if (!canWrite || cssInstalling) return;
    setCssInstalling(true);
    setCssError(null);
    setCssResult(null);
    try {
      const version = cssVersion.trim();
      const result = await apiClient.installCS2CounterStrikeSharp(serverId, version ? { version } : undefined);
      setCssResult(result);
      if (result.ok) await loadStatus();
    } catch (err: any) {
      setCssError(err?.response?.data?.error || err?.message || 'Installation failed.');
    } finally {
      setCssInstalling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 gap-2 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking framework status…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        {loadError}
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* MetaMod:Source */}
      <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <h4 className={`text-sm font-semibold ${textPrimary}`}>MetaMod:Source</h4>
            <p className={`text-xs ${textSecondary}`}>
              A widely used plugin framework that provides the foundation for loading and managing server extensions on Counter-Strike 2 servers.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <StatusBadge label="Installed" active={status?.metamodInstalled ?? false} />
            </div>
          </div>
          {canWrite && (
            <div className="shrink-0 flex flex-col gap-2 w-full sm:w-56">
              <VersionSelect
                status={metamodVersionsStatus}
                versions={metamodVersions}
                value={metamodVersion}
                onChange={setMetamodVersion}
                disabled={metamodInstalling}
                placeholder="e.g. 2.0.0.1402"
              />
              <AppButton
                tone="secondary"
                onClick={() => void installMetamod()}
                disabled={metamodInstalling || !isStopped}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 whitespace-nowrap"
              >
                {metamodInstalling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {status?.metamodInstalled ? 'Update MetaMod' : 'Install MetaMod'}
              </AppButton>
            </div>
          )}
        </div>
        {canWrite && !isStopped && (
          <div className="mt-3 flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            The server must be stopped to install MetaMod:Source.
          </div>
        )}
        {metamodError && (
          <div className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {metamodError}
          </div>
        )}
        <LogOutput result={metamodResult} />
      </div>

      {/* CounterStrikeSharp */}
      <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <h4 className={`text-sm font-semibold ${textPrimary}`}>CounterStrikeSharp</h4>
            <p className={`text-xs ${textSecondary}`}>
              A modern plugin framework that enables the development and execution of custom Counter-Strike 2 server plugins using C# and .NET.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <StatusBadge label="Installed" active={status?.counterStrikeSharpInstalled ?? false} />
            </div>
          </div>
          {canWrite && (
            <div className="shrink-0 flex flex-col gap-2 w-full sm:w-56">
              <VersionSelect
                status={cssVersionsStatus}
                versions={cssVersions}
                value={cssVersion}
                onChange={setCssVersion}
                disabled={cssInstalling || !isStopped || !(status?.metamodInstalled)}
                placeholder="e.g. v1.0.369"
              />
              <AppButton
                tone="secondary"
                onClick={() => void installCSS()}
                disabled={cssInstalling || !isStopped || !(status?.metamodInstalled)}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 whitespace-nowrap"
              >
                {cssInstalling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {status?.counterStrikeSharpInstalled ? 'Update CSS' : 'Install CSS'}
              </AppButton>
            </div>
          )}
        </div>
        {canWrite && !isStopped && (
          <div className="mt-3 flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            The server must be stopped to install CounterStrikeSharp.
          </div>
        )}
        {canWrite && isStopped && !status?.metamodInstalled && (
          <div className="mt-3 flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            MetaMod:Source must be installed before CounterStrikeSharp.
          </div>
        )}
        {cssError && (
          <div className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {cssError}
          </div>
        )}
        <LogOutput result={cssResult} />
      </div>

    </div>
  );
}
