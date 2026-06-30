import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import {
  fetchBedrockVersions,
  fetchFabricInstallers,
  fetchFabricLoaders,
  fetchFabricVersions,
  fetchJavaVersions,
  fetchNeoForgeVersions,
  fetchPaperBuilds,
  fetchPaperVersions,
  type BedrockVersion,
  type FabricVersion,
  type JavaVersion,
  type McServerType,
  type NeoForgeVersion,
  type PaperBuild,
} from '../utils/minecraftCatalog';

interface MinecraftVersionPickerProps {
  serverType: McServerType;
  initialEnv?: Record<string, string>;
  canEdit?: boolean;
  onEnvChange: (env: Record<string, string>) => void;
}

const selectCls =
  'w-full rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20 focus:border-transparent disabled:opacity-50 transition-all appearance-none cursor-pointer';

const inputCls =
  'w-full rounded-lg bg-white dark:bg-[#0f1723]/60 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--gp-ods-accent-primary)] dark:focus:ring-white/20 focus:border-transparent disabled:opacity-50 transition-all';

const labelCls = 'block text-xs text-gray-500 dark:text-gray-400 mb-1';

function Skeleton() {
  return <div className="h-9 rounded-lg bg-gray-200 dark:bg-gray-700/50 animate-pulse" />;
}

function LatestBadge() {
  return (
    <span className="ml-1.5 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--gp-ods-accent-primary)]/15 text-[var(--gp-ods-accent-primary)] border border-[var(--gp-ods-accent-primary)]/30 align-middle">
      Latest
    </span>
  );
}

function CatalogError() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-500 dark:text-amber-400">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      Could not load catalog — enter version manually
    </div>
  );
}

type LoadStatus = 'loading' | 'loaded' | 'failed';

export function MinecraftVersionPicker({
  serverType,
  initialEnv = {},
  canEdit = true,
  onEnvChange,
}: MinecraftVersionPickerProps) {
  const [status, setStatus] = useState<LoadStatus>('loading');

  // Catalog data
  const [javaVersions, setJavaVersions] = useState<JavaVersion[]>([]);
  const [paperMcVersions, setPaperMcVersions] = useState<string[]>([]);
  const [paperBuilds, setPaperBuilds] = useState<PaperBuild[]>([]);
  const [buildsStatus, setBuildsStatus] = useState<LoadStatus>('loading');
  const [fabricMcVersions, setFabricMcVersions] = useState<FabricVersion[]>([]);
  const [fabricLoaders, setFabricLoaders] = useState<FabricVersion[]>([]);
  const [fabricInstallers, setFabricInstallers] = useState<FabricVersion[]>([]);
  const [neoforgeVersions, setNeoforgeVersions] = useState<NeoForgeVersion[]>([]);
  const [bedrockVersions, setBedrockVersions] = useState<BedrockVersion[]>([]);

  // Selection state
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showBeta, setShowBeta] = useState(false);

  const [mcVersion, setMcVersion] = useState(initialEnv.MC_VERSION ?? '');
  const [paperBuild, setPaperBuild] = useState('');
  const [fabricLoader, setFabricLoader] = useState(initialEnv.FABRIC_LOADER_VERSION ?? '');
  const [fabricInstaller, setFabricInstaller] = useState(initialEnv.FABRIC_INSTALLER_VERSION ?? '');
  const [neoforgeVersion, setNeoforgeVersion] = useState(initialEnv.NEOFORGE_VERSION ?? '');
  const [bedrockChannel, setBedrockChannel] = useState<'release' | 'preview'>('release');

  // Load catalog on mount
  useEffect(() => {
    setStatus('loading');
    let cancelled = false;

    const load = async () => {
      try {
        switch (serverType) {
          case 'vanilla': {
            const versions = await fetchJavaVersions();
            if (cancelled) return;
            if (!versions) { setStatus('failed'); return; }
            setJavaVersions(versions);
            const releases = versions.filter((v) => v.type === 'release');
            const matched = initialEnv.MC_VERSION
              ? versions.find((v) => v.version === initialEnv.MC_VERSION)
              : undefined;
            const init = matched?.version ?? releases[0]?.version ?? versions[0]?.version ?? '';
            setMcVersion(init);
            // Preselect the server's real version: if it's a snapshot, reveal snapshots
            // so it appears in (and stays selected in) the dropdown.
            if (matched?.type === 'snapshot') setShowSnapshots(true);
            break;
          }
          case 'paper': {
            const mcVers = await fetchPaperVersions();
            if (cancelled) return;
            if (!mcVers) { setStatus('failed'); return; }
            setPaperMcVersions(mcVers);
            const init = initialEnv.MC_VERSION && mcVers.includes(initialEnv.MC_VERSION)
              ? initialEnv.MC_VERSION
              : mcVers[0] ?? '';
            setMcVersion(init);
            break;
          }
          case 'fabric': {
            const [vers, loaders, installers] = await Promise.all([
              fetchFabricVersions(),
              fetchFabricLoaders(),
              fetchFabricInstallers(),
            ]);
            if (cancelled) return;
            if (!vers || !loaders || !installers) { setStatus('failed'); return; }
            setFabricMcVersions(vers);
            setFabricLoaders(loaders);
            setFabricInstallers(installers);
            const stableVers = vers.filter((v) => v.stable);
            const stableLoaders = loaders.filter((l) => l.stable);
            const stableInstallers = installers.filter((i) => i.stable);
            setMcVersion(
              initialEnv.MC_VERSION && vers.some((v) => v.version === initialEnv.MC_VERSION)
                ? initialEnv.MC_VERSION
                : stableVers[0]?.version ?? vers[0]?.version ?? ''
            );
            setFabricLoader(
              initialEnv.FABRIC_LOADER_VERSION && loaders.some((l) => l.version === initialEnv.FABRIC_LOADER_VERSION)
                ? initialEnv.FABRIC_LOADER_VERSION
                : stableLoaders[0]?.version ?? loaders[0]?.version ?? ''
            );
            setFabricInstaller(
              initialEnv.FABRIC_INSTALLER_VERSION && installers.some((i) => i.version === initialEnv.FABRIC_INSTALLER_VERSION)
                ? initialEnv.FABRIC_INSTALLER_VERSION
                : stableInstallers[0]?.version ?? installers[0]?.version ?? ''
            );
            break;
          }
          case 'neoforge': {
            const versions = await fetchNeoForgeVersions();
            if (cancelled) return;
            if (!versions) { setStatus('failed'); return; }
            setNeoforgeVersions(versions);
            const stable = versions.filter((v) => v.channel === 'stable');
            const matched = initialEnv.NEOFORGE_VERSION
              ? versions.find((v) => v.version === initialEnv.NEOFORGE_VERSION)
              : undefined;
            setNeoforgeVersion(matched?.version ?? stable[0]?.version ?? versions[0]?.version ?? '');
            // Preselect the server's real version: if it's a beta build, reveal betas.
            if (matched && matched.channel !== 'stable') setShowBeta(true);
            break;
          }
          case 'bedrock': {
            const versions = await fetchBedrockVersions();
            if (cancelled) return;
            if (!versions) { setStatus('failed'); return; }
            setBedrockVersions(versions);
            if (initialEnv.MC_VERSION) {
              const matched = versions.find((v) => v.version === initialEnv.MC_VERSION);
              if (matched) setBedrockChannel(matched.channel);
            }
            break;
          }
        }
        if (!cancelled) setStatus('loaded');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [serverType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paper: re-fetch builds when mcVersion changes
  useEffect(() => {
    if (serverType !== 'paper' || !mcVersion || status !== 'loaded') return;
    setBuildsStatus('loading');
    let cancelled = false;
    fetchPaperBuilds(mcVersion).then((builds) => {
      if (cancelled) return;
      if (!builds) { setBuildsStatus('failed'); return; }
      setPaperBuilds(builds);
      setBuildsStatus('loaded');
      const initBuild = initialEnv.PAPER_BUILD && initialEnv.PAPER_BUILD !== 'latest'
        && builds.some((b) => String(b.build) === initialEnv.PAPER_BUILD)
        ? initialEnv.PAPER_BUILD
        : String(builds.find((b) => b.channel === 'STABLE')?.build ?? builds[0]?.build ?? '');
      setPaperBuild(initBuild);
    });
    return () => { cancelled = true; };
  }, [serverType, mcVersion, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute env and notify parent
  const onEnvChangeRef = useRef(onEnvChange);
  useEffect(() => { onEnvChangeRef.current = onEnvChange; });

  const computedEnv = useMemo((): Record<string, string> => {
    switch (serverType) {
      case 'vanilla':
        return mcVersion ? { MC_VERSION: mcVersion } : {};
      case 'paper':
        if (!mcVersion || !paperBuild) return {};
        return { MC_VERSION: mcVersion, PAPER_BUILD: paperBuild, PAPERMC_USER_AGENT: 'gamepanel/1.0' };
      case 'fabric':
        if (!mcVersion) return {};
        return { MC_VERSION: mcVersion, FABRIC_LOADER_VERSION: fabricLoader, FABRIC_INSTALLER_VERSION: fabricInstaller };
      case 'neoforge': {
        const meta = neoforgeVersions.find((v) => v.version === neoforgeVersion);
        return neoforgeVersion && meta
          ? { NEOFORGE_VERSION: neoforgeVersion, MC_VERSION: meta.minecraftVersion }
          : neoforgeVersion
          ? { NEOFORGE_VERSION: neoforgeVersion }
          : {};
      }
      case 'bedrock': {
        const ver = bedrockVersions.find((v) => v.channel === bedrockChannel);
        return ver ? { MC_VERSION: ver.version, BEDROCK_DOWNLOAD_URL: ver.downloadUrl } : {};
      }
    }
  }, [serverType, mcVersion, paperBuild, fabricLoader, fabricInstaller, neoforgeVersion, bedrockChannel, bedrockVersions]);

  useEffect(() => {
    if (Object.keys(computedEnv).length > 0) {
      onEnvChangeRef.current(computedEnv);
    }
  }, [computedEnv]);

  // ── Vanilla ────────────────────────────────────────────────────────────────
  if (serverType === 'vanilla') {
    const visibleVersions = showSnapshots ? javaVersions : javaVersions.filter((v) => v.type === 'release');
    return (
      <div className="space-y-2.5">
        <div>
          <label className={labelCls}>Minecraft Version</label>
          {status === 'loading' && <Skeleton />}
          {status === 'failed' && (
            <>
              <CatalogError />
              <input className={`${inputCls} mt-1.5`} value={mcVersion} disabled={!canEdit}
                onChange={(e) => setMcVersion(e.target.value)} placeholder="e.g. 1.21.6" />
            </>
          )}
          {status === 'loaded' && (
            <div className="relative">
              <select className={selectCls} value={mcVersion} disabled={!canEdit}
                onChange={(e) => setMcVersion(e.target.value)}>
                {visibleVersions.map((v, i) => (
                  <option key={v.version} value={v.version}>
                    {v.version}{i === 0 ? ' (Latest)' : ''}{v.type === 'snapshot' ? ' [snapshot]' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
          <input type="checkbox" checked={showSnapshots} onChange={(e) => setShowSnapshots(e.target.checked)}
            className="rounded border-gray-600 accent-[var(--gp-ods-accent-primary)]" />
          Include snapshots
        </label>
      </div>
    );
  }

  // ── Paper ──────────────────────────────────────────────────────────────────
  if (serverType === 'paper') {
    return (
      <div className="space-y-2.5">
        <div>
          <label className={labelCls}>Minecraft Version</label>
          {status === 'loading' && <Skeleton />}
          {status === 'failed' && (
            <>
              <CatalogError />
              <input className={`${inputCls} mt-1.5`} value={mcVersion} disabled={!canEdit}
                onChange={(e) => setMcVersion(e.target.value)} placeholder="e.g. 1.21.6" />
            </>
          )}
          {status === 'loaded' && (
            <div className="relative">
              <select className={selectCls} value={mcVersion} disabled={!canEdit}
                onChange={(e) => setMcVersion(e.target.value)}>
                {paperMcVersions.map((v, i) => (
                  <option key={v} value={v}>{v}{i === 0 ? ' (Latest)' : ''}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Paper Build</label>
          {buildsStatus === 'loading' && <Skeleton />}
          {buildsStatus === 'failed' && (
            <input className={inputCls} value={paperBuild} disabled={!canEdit}
              onChange={(e) => setPaperBuild(e.target.value)} placeholder="e.g. 468" />
          )}
          {buildsStatus === 'loaded' && (
            <div className="relative">
              <select className={selectCls} value={paperBuild} disabled={!canEdit}
                onChange={(e) => setPaperBuild(e.target.value)}>
                {paperBuilds.map((b, i) => (
                  <option key={b.build} value={String(b.build)}>
                    #{b.build}{i === 0 ? ' — Latest' : ''}{b.channel !== 'STABLE' ? ` (${b.channel.toLowerCase()})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Fabric ─────────────────────────────────────────────────────────────────
  if (serverType === 'fabric') {
    const stableMcVersions = fabricMcVersions.filter((v) => v.stable);
    const visibleMc = stableMcVersions.length > 0 ? stableMcVersions : fabricMcVersions;
    return (
      <div className="space-y-2.5">
        <div>
          <label className={labelCls}>Minecraft Version</label>
          {status === 'loading' && <Skeleton />}
          {status === 'failed' && (
            <>
              <CatalogError />
              <input className={`${inputCls} mt-1.5`} value={mcVersion} disabled={!canEdit}
                onChange={(e) => setMcVersion(e.target.value)} placeholder="e.g. 1.21.6" />
            </>
          )}
          {status === 'loaded' && (
            <div className="relative">
              <select className={selectCls} value={mcVersion} disabled={!canEdit}
                onChange={(e) => setMcVersion(e.target.value)}>
                {visibleMc.map((v, i) => (
                  <option key={v.version} value={v.version}>{v.version}{i === 0 ? ' (Latest)' : ''}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          )}
        </div>

        {status === 'loaded' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Loader Version</label>
              <div className="relative">
                <select className={selectCls} value={fabricLoader} disabled={!canEdit}
                  onChange={(e) => setFabricLoader(e.target.value)}>
                  {fabricLoaders.map((l, i) => (
                    <option key={l.version} value={l.version}>{l.version}{i === 0 ? ' (Latest)' : ''}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Installer Version</label>
              <div className="relative">
                <select className={selectCls} value={fabricInstaller} disabled={!canEdit}
                  onChange={(e) => setFabricInstaller(e.target.value)}>
                  {fabricInstallers.map((i, idx) => (
                    <option key={i.version} value={i.version}>{i.version}{idx === 0 ? ' (Latest)' : ''}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── NeoForge ───────────────────────────────────────────────────────────────
  if (serverType === 'neoforge') {
    const visibleVersions = showBeta
      ? neoforgeVersions
      : neoforgeVersions.filter((v) => v.channel === 'stable');
    const selectedMeta = neoforgeVersions.find((v) => v.version === neoforgeVersion);
    return (
      <div className="space-y-2.5">
        <div>
          <label className={labelCls}>NeoForge Version</label>
          {status === 'loading' && <Skeleton />}
          {status === 'failed' && (
            <>
              <CatalogError />
              <input className={`${inputCls} mt-1.5`} value={neoforgeVersion} disabled={!canEdit}
                onChange={(e) => setNeoforgeVersion(e.target.value)} placeholder="e.g. 21.1.230" />
            </>
          )}
          {status === 'loaded' && (
            <div className="relative">
              <select className={selectCls} value={neoforgeVersion} disabled={!canEdit}
                onChange={(e) => setNeoforgeVersion(e.target.value)}>
                {visibleVersions.map((v, i) => (
                  <option key={v.version} value={v.version}>
                    {v.version}{i === 0 ? ' (Latest)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          )}
          {selectedMeta && (
            <p className="mt-1 text-xs text-gray-500">Equivalent to Minecraft version {selectedMeta.minecraftVersion}</p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
          <input type="checkbox" checked={showBeta} onChange={(e) => setShowBeta(e.target.checked)}
            className="rounded border-gray-600 accent-[var(--gp-ods-accent-primary)]" />
          Show beta versions
        </label>
      </div>
    );
  }

  // ── Bedrock ────────────────────────────────────────────────────────────────
  if (serverType === 'bedrock') {
    return (
      <div className="space-y-2">
        <label className={labelCls}>Edition</label>
        {status === 'loading' && (
          <div className="grid grid-cols-2 gap-2">
            <Skeleton />
            <Skeleton />
          </div>
        )}
        {status === 'failed' && (
          <>
            <CatalogError />
            <input className={`${inputCls} mt-1.5`}
              value={computedEnv.MC_VERSION ?? ''} disabled={!canEdit}
              onChange={() => {
                /* fallback: just set mc version manually */
              }}
              placeholder="e.g. 1.21.80.03" />
          </>
        )}
        {status === 'loaded' && (
          <div className="grid grid-cols-2 gap-2">
            {(['release', 'preview'] as const).map((channel) => {
              const ver = bedrockVersions.find((v) => v.channel === channel);
              const isSelected = bedrockChannel === channel;
              return (
                <button
                  key={channel}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setBedrockChannel(channel)}
                  className={`flex flex-col items-start gap-0.5 px-4 py-3 rounded-lg border text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'border-[var(--gp-ods-accent-primary)] bg-[var(--gp-ods-accent-primary)]/10'
                      : 'border-gray-300 dark:border-gray-700/50 bg-white dark:bg-[#0f1723]/40 hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'border-[var(--gp-ods-accent-primary)]' : 'border-gray-400'
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[var(--gp-ods-accent-primary)]" />}
                    </div>
                    <span className={`text-sm font-medium capitalize ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                      {channel}
                    </span>
                    {channel === 'release' && <LatestBadge />}
                  </div>
                  {ver && <p className="text-xs text-gray-500 pl-5">{ver.version}</p>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}

export { LatestBadge };
