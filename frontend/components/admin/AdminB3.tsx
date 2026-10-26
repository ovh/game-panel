import { useCallback, useEffect, useState } from 'react';
import { Bot, Database, Gavel, Play, Plus, Puzzle, RotateCcw, RotateCw, Search, Shield, Square, Upload } from 'lucide-react';
import { ConfirmationModal } from '../ConfirmationModal';
import { apiClient } from '../../utils/api';
import { adminApi, apiError, type B3Ban, type B3Client, type B3Group, type B3Plugins } from '../../utils/adminApi';
import { Note, Panel, SmallButton, formatBytes, inputCls, td, th } from './shared';

// B3 tab: start / stop, plugins on / off (b3.xml), admins (B3 groups straight in its database), bans, database backup.
export function AdminB3({ serverId, b3State }: { serverId: string; b3State: string | null }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [plugins, setPlugins] = useState<B3Plugins | null>(null);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [groups, setGroups] = useState<B3Group[]>([]);
  const [clients, setClients] = useState<B3Client[] | null>(null);
  const [search, setSearch] = useState('');
  const [bans, setBans] = useState<B3Ban[] | null>(null);
  const [backups, setBackups] = useState<Array<{ file: string; size: number; time: number }>>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toRestore, setToRestore] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ py: File | null; conf: File | null; enable: boolean }>({ py: null, conf: null, enable: true });

  const loadClients = useCallback(
    async (text: string) => {
      try {
        const data = await adminApi.b3Clients(serverId, text);
        setGroups(data.groups);
        setClients(data.clients);
        setDbError(null);
      } catch (e) {
        setDbError(apiError(e, 'Could not read the B3 database.'));
      }
    },
    [serverId]
  );

  const load = useCallback(async () => {
    adminApi
      .b3Plugins(serverId)
      .then((p) => {
        setPlugins(p);
        setPluginError(null);
      })
      .catch((e) => setPluginError(apiError(e, 'Could not read b3.xml.')));
    void loadClients('');
    adminApi.b3Bans(serverId).then((b) => setBans(b.bans)).catch(() => setBans(null));
    adminApi.b3Backups(serverId).then((b) => setBackups(b.backups)).catch(() => setBackups([]));
  }, [serverId, loadClients]);

  useEffect(() => {
    setPlugins(null);
    setClients(null);
    setBans(null);
    setResult(null);
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setResult(null);
    try {
      await fn();
      setResult({ ok: true, text: ok });
    } catch (e) {
      setResult({ ok: false, text: apiError(e, 'That did not work.') });
    } finally {
      setBusy(false);
    }
  };

  const groupName = (bits: string) => groups.find((g) => g.id === bits)?.name ?? `bits ${bits}`;

  return (
    <div className="space-y-4">
      <Note result={result} />
      <Panel
        title={`B3 · ${b3State ?? 'not installed'}`}
        icon={<Bot className="h-4 w-4" />}
        actions={
          <>
            <SmallButton tone="good" disabled={busy} onClick={() => void act(() => adminApi.b3Action(serverId, 'start'), 'B3 start sent.')}>
              <Play className="h-3.5 w-3.5" /> Start
            </SmallButton>
            <SmallButton disabled={busy} onClick={() => void act(() => adminApi.b3Action(serverId, 'restart'), 'B3 restart sent.')}>
              <RotateCw className="h-3.5 w-3.5" /> Restart
            </SmallButton>
            <SmallButton tone="danger" disabled={busy} onClick={() => void act(() => adminApi.b3Action(serverId, 'stop'), 'B3 stop sent.')}>
              <Square className="h-3.5 w-3.5" /> Stop
            </SmallButton>
          </>
        }
      >
        <p className="text-xs text-gray-400">Install, console, b3.xml editor and logs stay in the server's Settings &gt; Game config &gt; B3 card.</p>
      </Panel>

      <Panel title="Plugins" icon={<Puzzle className="h-4 w-4" />}>
        {pluginError ? (
          <p className="text-sm text-amber-300">{pluginError}</p>
        ) : !plugins ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {plugins.plugins.map((p) => (
                <label key={p.name} className="flex items-center justify-between gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold text-white">{p.name}</span>
                    {plugins.extplugins.includes(p.name) && <span className="ml-1 text-xs text-gray-400">(ext)</span>}
                  </span>
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    disabled={busy}
                    onChange={(e) =>
                      void act(async () => {
                        await adminApi.b3SetPlugin(serverId, p.name, e.target.checked, true);
                        setPlugins((cur) => (cur ? { ...cur, plugins: cur.plugins.map((x) => (x.name === p.name ? { ...x, enabled: e.target.checked } : x)) } : cur));
                      }, `${p.name} ${e.target.checked ? 'on' : 'off'}, B3 restarts.`)
                    }
                  />
                </label>
              ))}
            </div>
            {plugins.extplugins.filter((n) => !plugins.plugins.some((p) => p.name === n)).length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                In extplugins but not in b3.xml:
                {plugins.extplugins
                  .filter((n) => !plugins.plugins.some((p) => p.name === n))
                  .map((n) => (
                    <SmallButton
                      key={n}
                      disabled={busy}
                      title="Add a <plugin> line to b3.xml and restart B3"
                      onClick={() =>
                        void act(async () => {
                          await adminApi.b3AddPlugin(serverId, n, true);
                          setPlugins(await adminApi.b3Plugins(serverId));
                        }, `${n} added to b3.xml, B3 restarts.`)
                      }
                    >
                      <Plus className="h-3.5 w-3.5" /> {n}
                    </SmallButton>
                  ))}
              </div>
            )}
            <p className="mt-2 text-xs text-gray-400">Config: {plugins.config}</p>
            <div className="mt-4 rounded-lg border border-gray-700 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                <Upload className="h-4 w-4" /> Upload a plugin
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300">
                <label className="flex items-center gap-2">
                  .py file
                  <input type="file" accept=".py" onChange={(e) => setUpload((u) => ({ ...u, py: e.target.files?.[0] ?? null }))} />
                </label>
                <label className="flex items-center gap-2">
                  config (.ini / .xml, optional)
                  <input type="file" accept=".ini,.xml" onChange={(e) => setUpload((u) => ({ ...u, conf: e.target.files?.[0] ?? null }))} />
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={upload.enable} onChange={(e) => setUpload((u) => ({ ...u, enable: e.target.checked }))} />
                  turn on in b3.xml and restart B3
                </label>
                <SmallButton
                  tone="good"
                  disabled={busy || !upload.py}
                  onClick={() =>
                    void act(async () => {
                      if (!upload.py) return;
                      const name = upload.py.name.replace(/\.py$/i, '').toLowerCase();
                      const res = await adminApi.b3UploadPlugin(serverId, {
                        name,
                        code: await upload.py.text(),
                        configName: upload.conf?.name,
                        config: upload.conf ? await upload.conf.text() : undefined,
                        enable: upload.enable,
                        restart: upload.enable,
                      });
                      setPlugins(await adminApi.b3Plugins(serverId));
                      if (!res.added && upload.enable) throw new Error(`${name}.py uploaded; it was already in b3.xml.`);
                    }, `${upload.py?.name} uploaded to extplugins${upload.enable ? ', turned on, B3 restarts' : ''}.`)
                  }
                >
                  <Upload className="h-3.5 w-3.5" /> Upload
                </SmallButton>
              </div>
              <p className="mt-2 text-xs text-gray-400">The .py goes to extplugins/, the config to extplugins/conf/.</p>
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="Admins"
        icon={<Shield className="h-4 w-4" />}
        actions={
          <span className="inline-flex gap-1.5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void loadClients(search)}
              placeholder="Find a player by name"
              className={`${inputCls} py-1 text-xs`}
            />
            <SmallButton onClick={() => void loadClients(search)}>
              <Search className="h-3.5 w-3.5" /> Find
            </SmallButton>
          </span>
        }
      >
        {dbError ? (
          <p className="text-sm text-amber-300">{dbError}</p>
        ) : !clients ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className={th}>Player</th>
                  <th className={th}>GUID</th>
                  <th className={th}>Last seen</th>
                  <th className={th}>Group</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 && (
                  <tr>
                    <td className={td} colSpan={4}>
                      {search ? 'No player with that name.' : 'No admins yet: find a player by name and give them a group.'}
                    </td>
                  </tr>
                )}
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-gray-800 last:border-0">
                    <td className={`${td} font-semibold text-white`}>
                      {c.name} <span className="text-xs font-normal text-gray-400">@{c.id}</span>
                    </td>
                    <td className={`${td} font-mono text-xs`}>{c.guid}</td>
                    <td className={`${td} text-xs`}>{c.last_seen}</td>
                    <td className={td}>
                      <select
                        value={c.group_bits}
                        disabled={busy}
                        onChange={(e) =>
                          void act(async () => {
                            await adminApi.b3SetGroup(serverId, c.id, Number(e.target.value));
                            setClients((list) => (list ? list.map((x) => (x.id === c.id ? { ...x, group_bits: e.target.value } : x)) : list));
                          }, `${c.name} is now ${groupName(e.target.value)} (B3 uses it from the player's next connect or a B3 restart).`)
                        }
                        className={`${inputCls} py-1 text-xs`}
                      >
                        {groups.every((g) => g.id !== c.group_bits) && <option value={c.group_bits}>bits {c.group_bits}</option>}
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} ({g.level})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Active bans" icon={<Gavel className="h-4 w-4" />}>
        {!bans ? (
          <p className="text-sm text-gray-400">{dbError ? '–' : 'Loading…'}</p>
        ) : bans.length === 0 ? (
          <p className="text-sm text-gray-400">No active bans.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className={th}>Player</th>
                  <th className={th}>Type</th>
                  <th className={th}>Reason</th>
                  <th className={th}>By</th>
                  <th className={th}>Added</th>
                  <th className={th}>Expires</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {bans.map((b) => (
                  <tr key={b.id} className="border-b border-gray-800 last:border-0">
                    <td className={`${td} font-semibold text-white`}>{b.player}</td>
                    <td className={td}>{b.type}</td>
                    <td className={td}>{b.reason}</td>
                    <td className={td}>{b.admin || '–'}</td>
                    <td className={`${td} text-xs`}>{b.added}</td>
                    <td className={`${td} text-xs`}>{b.expires || 'never'}</td>
                    <td className={`${td} text-right`}>
                      <SmallButton
                        tone="good"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await adminApi.b3Unban(serverId, b.id);
                            setBans((list) => (list ? list.filter((x) => x.id !== b.id) : list));
                          }, `${b.player} unbanned in B3. A ban made by CoD4X itself (permban) is lifted in the RCON console with unban.`)
                        }
                      >
                        Unban
                      </SmallButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Database backup"
        icon={<Database className="h-4 w-4" />}
        actions={
          <SmallButton
            disabled={busy || Boolean(dbError)}
            onClick={() =>
              void act(async () => {
                const res = await adminApi.b3Backup(serverId);
                setBackups((list) => [{ file: res.file, size: res.size, time: Date.now() }, ...list]);
              }, 'Backup made.')
            }
          >
            <Database className="h-3.5 w-3.5" /> Back up now
          </SmallButton>
        }
      >
        {backups.length === 0 ? (
          <p className="text-sm text-gray-400">No backups yet. They are saved in the server folder b3-backups/.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {backups.map((b) => (
              <li key={b.file} className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="font-mono text-xs text-[var(--color-cyan-400)] underline"
                  onClick={() => {
                    void apiClient.getServerDownloadUrl(Number(serverId), b.file).then((url) => window.open(url, '_blank'));
                  }}
                >
                  {b.file}
                </button>
                <span className="text-xs text-gray-400">
                  {formatBytes(b.size)} · {new Date(b.time).toLocaleString()}
                </span>
                <SmallButton tone="danger" disabled={busy || Boolean(dbError)} onClick={() => setToRestore(b.file)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </SmallButton>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <ConfirmationModal
        isOpen={toRestore !== null}
        onClose={() => setToRestore(null)}
        onConfirm={async () => {
          const file = toRestore;
          setToRestore(null);
          if (file) {
            await act(async () => {
              await adminApi.b3Restore(serverId, file);
              void loadClients('');
            }, `B3 database restored from ${file}.`);
          }
        }}
        title="Restore the B3 database"
        message={`Replace the B3 database with ${toRestore ?? ''}? Everything newer than that backup (players, bans, admins) is lost. B3 is stopped during the restore.`}
        confirmText="Restore"
        icon="danger"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </div>
  );
}
