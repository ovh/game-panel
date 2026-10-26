import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FolderOpen, PackageOpen, RefreshCw, Save, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { adminApi, apiError, type AdminSettings, type Cod4FilesInfo } from '../../utils/adminApi';
import { ConfirmationModal } from '../ConfirmationModal';
import { Note, Panel, SmallButton, formatBytes, inputCls } from './shared';

// CoD4 files tab: the cod4-linux folder new servers are made from (state, fill it from a server, keep it somewhere),
// and what a new CoD4 server gets (slots, mod, FastDL, B3, starting server.cfg).
export function AdminCod4Files() {
  const [info, setInfo] = useState<Cod4FilesInfo | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [source, setSource] = useState('');
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [defaults, setDefaults] = useState<AdminSettings['cod4Defaults'] | null>(null);
  const [savedDefaults, setSavedDefaults] = useState<AdminSettings['cod4Defaults'] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminApi.cod4Files();
      setInfo(data);
      setSource((cur) => cur || String(data.servers[0]?.id ?? ''));
      return data;
    } catch (e) {
      setResult({ ok: false, text: apiError(e, 'Could not check the cod4-linux folder.') });
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
    adminApi
      .settings()
      .then((s) => {
        setDefaults(s.cod4Defaults);
        setSavedDefaults(s.cod4Defaults);
      })
      .catch(() => undefined);
  }, [load]);

  // while the folder is being filled
  useEffect(() => {
    if (!info?.refresh.running) return;
    const timer = setInterval(() => {
      void load().then((data) => {
        if (data && !data.refresh.running) {
          setResult(
            data.refresh.error
              ? { ok: false, text: `Filling the folder failed: ${data.refresh.error}` }
              : {
                  ok: true,
                  text:
                    `cod4-linux filled: ${data.refresh.linked} file(s) linked, ${data.refresh.copied} copied.` +
                    (data.refresh.linked === 0 && data.refresh.serverId
                      ? `\nThe big files were copied (the panel sees the folder and the servers as two disks). To share them again, on the panel server: bash gp-cod4-linux.sh --relink ${data.refresh.serverId}`
                      : ''),
                }
          );
        }
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [info?.refresh.running, load]);

  const saveDefaults = async () => {
    if (!defaults) return;
    setBusy(true);
    setResult(null);
    try {
      const next = await adminApi.saveSettings({ cod4Defaults: defaults });
      setDefaults(next.cod4Defaults);
      setSavedDefaults(next.cod4Defaults);
      setResult({ ok: true, text: 'Defaults for new servers saved.' });
    } catch (e) {
      setResult({ ok: false, text: apiError(e, 'Could not save.') });
    } finally {
      setBusy(false);
    }
  };

  const sourceName = info?.servers.find((s) => String(s.id) === source)?.name ?? source;
  const dirty = JSON.stringify(defaults) !== JSON.stringify(savedDefaults);

  return (
    <div className="space-y-4">
      <Note result={result} />

      <Panel
        title="cod4-linux folder"
        icon={<FolderOpen className="h-4 w-4" />}
        actions={
          <SmallButton disabled={busy} onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Check
          </SmallButton>
        }
      >
        {!info ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              {info.ready ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
              <span className={info.ready ? 'text-emerald-300' : 'text-amber-300'}>{info.ready ? 'Ready for new servers' : 'Not ready'}</span>
              <code className="text-xs text-gray-400">{info.hostFolder}</code>
            </p>
            {info.problems.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-amber-300">
                {info.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-gray-300">
              <span>main: {info.summary.iwd} .iwd</span>
              <span>zone: {info.summary.zone} files</span>
              <span>mods: {info.summary.mods}</span>
              <span>usermaps: {info.summary.usermaps}</span>
              <span>size: {formatBytes(info.size)}</span>
              <span>CoD4X: {info.summary.dedrunTime ? new Date(info.summary.dedrunTime).toLocaleDateString() : '–'}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-800 pt-3">
              <span className="text-xs text-gray-400">Fill it from a server (e.g. after updating CoD4X there):</span>
              <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)} disabled={info.refresh.running}>
                {info.servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} #{s.id}
                  </option>
                ))}
              </select>
              <SmallButton disabled={busy || info.refresh.running || !source} onClick={() => setConfirmRefresh(true)}>
                <RefreshCw className={`h-3.5 w-3.5 ${info.refresh.running ? 'animate-spin' : ''}`} />
                {info.refresh.running ? `Filling… (${info.refresh.linked + info.refresh.copied} files)` : 'Refresh from this server'}
              </SmallButton>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-gray-700 p-3 text-xs text-gray-400">
              <PackageOpen className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Keep a copy somewhere (a new panel server is then ready in minutes): on the panel server{' '}
                <code>bash gp-cod4-linux.sh --pack</code> makes parts of max 1.9 GB in /root; put them in a <b>private</b> GitHub release or on your
                web server and fill a new folder with <code>bash gp-cod4-linux.sh --from &lt;link&gt;</code>. The game files are Activision's: never in a
                public repository.
              </span>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="New CoD4 servers get"
        icon={<SlidersHorizontal className="h-4 w-4" />}
        actions={
          <SmallButton tone="good" disabled={busy || !dirty} onClick={() => void saveDefaults()}>
            <Save className="h-3.5 w-3.5" /> Save
          </SmallButton>
        }
      >
        {!defaults ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-4 text-sm text-gray-300">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs text-gray-400">
                Slots (install form)
                <input
                  className={`${inputCls} w-24`}
                  type="number"
                  min={1}
                  max={64}
                  value={defaults.slots}
                  onChange={(e) => setDefaults({ ...defaults, slots: Number(e.target.value) })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-400">
                Mod (folder in mods/, empty = none)
                <input
                  className={inputCls}
                  value={defaults.mod}
                  placeholder="e.g. promod"
                  onChange={(e) => setDefaults({ ...defaults, mod: e.target.value.replace(/[^A-Za-z0-9_.-]/g, '') })}
                />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={defaults.fastdl} onChange={(e) => setDefaults({ ...defaults, fastdl: e.target.checked })} />
                FastDL on
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={defaults.b3} onChange={(e) => setDefaults({ ...defaults, b3: e.target.checked })} />
                Install and start B3
              </label>
            </div>
            <p className="text-xs text-gray-400">
              The mod is used only when the cod4-linux folder has it in mods/. B3 needs gp-b3.sh on the panel server; it is set up a minute after the
              first start.
            </p>
            <label className="flex flex-col gap-1 text-xs text-gray-400">
              Starting server.cfg (main/cod4server.cfg; empty = the one in the cod4-linux folder)
              <textarea
                className={`${inputCls} h-64 w-full font-mono text-xs`}
                spellCheck={false}
                value={defaults.serverCfg}
                placeholder={'set sv_hostname "^1My ^7server"\nset g_gametype "war"\nset sv_mapRotation "gametype war map mp_crash"'}
                onChange={(e) => setDefaults({ ...defaults, serverCfg: e.target.value })}
              />
            </label>
          </div>
        )}
      </Panel>

      <ConfirmationModal
        isOpen={confirmRefresh}
        onClose={() => setConfirmRefresh(false)}
        onConfirm={async () => {
          setConfirmRefresh(false);
          setResult(null);
          try {
            await adminApi.refreshCod4Files(Number(source));
            await load();
          } catch (e) {
            setResult({ ok: false, text: apiError(e, 'Could not start.') });
          }
        }}
        title="Refresh the cod4-linux folder"
        message={`Replace the cod4-linux folder with the files of ${sourceName} (without logs)? Servers installed earlier keep their own files.`}
        confirmText="Refresh"
        icon="warning"
      />
    </div>
  );
}
