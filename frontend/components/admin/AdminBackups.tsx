import { useCallback, useEffect, useState } from 'react';
import { Archive, Clock, Database, ExternalLink, Play, RotateCcw, Trash2 } from 'lucide-react';
import { apiClient } from '../../utils/api';
import { adminApi, apiError, type AdminSettings, type BackupItem, type DatabasesInfo } from '../../utils/adminApi';
import { ConfirmationModal } from '../ConfirmationModal';
import { Note, Panel, ServerPicker, SmallButton, formatBytes, inputCls, td, th, type Cod4Choice } from './shared';

// Backups tab: the daily automatic backup (configs + B3 database of every CoD4 server), every B3 database with
// phpMyAdmin, and one server's backups: make, download, restore, delete.
export function AdminBackups({ servers, serverId, onServer }: { servers: Cod4Choice[]; serverId: string; onServer: (id: string) => void }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [auto, setAuto] = useState<AdminSettings['autoBackup'] | null>(null);
  const [dbs, setDbs] = useState<DatabasesInfo | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupItem[] | null>(null);
  const [hasB3, setHasB3] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'restore' | 'delete'; item: BackupItem } | null>(null);

  useEffect(() => {
    adminApi
      .settings()
      .then((s) => {
        setSettings(s);
        setAuto(s.autoBackup);
      })
      .catch((e) => setResult({ ok: false, text: apiError(e, 'Could not read the settings.') }));
    adminApi
      .databases()
      .then(setDbs)
      .catch((e) => setDbError(apiError(e, 'Could not list the databases.')));
  }, []);

  const loadBackups = useCallback(async () => {
    if (!serverId) return;
    try {
      const data = await adminApi.backups(serverId);
      setBackups(data.backups);
      setHasB3(data.b3);
    } catch (e) {
      setBackups([]);
      setResult({ ok: false, text: apiError(e, 'Could not list the backups.') });
    }
  }, [serverId]);

  useEffect(() => {
    setBackups(null);
    void loadBackups();
  }, [loadBackups]);

  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    setResult(null);
    try {
      setResult({ ok: true, text: await fn() });
    } catch (e) {
      setResult({ ok: false, text: apiError(e, 'That did not work.') });
    } finally {
      setBusy(false);
    }
  };

  const autoDirty = Boolean(settings && auto && JSON.stringify(settings.autoBackup) !== JSON.stringify(auto));

  return (
    <div className="space-y-4">
      <Note result={result} />

      <Panel
        title="Automatic backup"
        icon={<Clock className="h-4 w-4" />}
        actions={
          <>
            <SmallButton
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const res = await adminApi.runBackupsNow();
                  void loadBackups();
                  setSettings(await adminApi.settings());
                  return `Backed up ${res.servers} server(s).${res.errors.length ? `\n${res.errors.join('\n')}` : ''}`;
                })
              }
            >
              <Play className="h-3.5 w-3.5" /> Run now
            </SmallButton>
            <SmallButton
              tone="good"
              disabled={busy || !autoDirty}
              onClick={() =>
                void act(async () => {
                  if (!auto) return '';
                  const next = await adminApi.saveSettings({ autoBackup: { enabled: auto.enabled, hour: auto.hour, keep: auto.keep } });
                  setSettings(next);
                  setAuto(next.autoBackup);
                  return 'Saved.';
                })
              }
            >
              Save
            </SmallButton>
          </>
        }
      >
        {!auto ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="flex flex-wrap items-end gap-4 text-sm text-gray-300">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={auto.enabled} onChange={(e) => setAuto({ ...auto, enabled: e.target.checked })} />
              Every day
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-400">
              At (server time)
              <select className={inputCls} value={auto.hour} onChange={(e) => setAuto({ ...auto, hour: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-400">
              Keep the last
              <input className={`${inputCls} w-24`} type="number" min={1} max={90} value={auto.keep} onChange={(e) => setAuto({ ...auto, keep: Number(e.target.value) })} />
            </label>
            <p className="text-xs text-gray-400">
              Configs (LinuxGSM, main/*.cfg, B3) and the B3 database of every CoD4 server, into each server's folder (config-backups/, b3-backups/).
              <br />
              Last run: {settings?.autoBackup.lastRun ? new Date(settings.autoBackup.lastRun).toLocaleString() : 'never'}
            </p>
          </div>
        )}
      </Panel>

      <Panel
        title="B3 databases"
        icon={<Database className="h-4 w-4" />}
        actions={
          dbs?.phpMyAdmin?.url ? (
            <a href={dbs.phpMyAdmin.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-cyan-400)] underline">
              <ExternalLink className="h-3.5 w-3.5" /> phpMyAdmin
            </a>
          ) : undefined
        }
      >
        {dbError ? (
          <p className="text-sm text-amber-300">{dbError}</p>
        ) : !dbs ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-gray-400">
              MariaDB (gamepanel-b3-db): {dbs.dbRunning ? <span className="text-emerald-300">running</span> : <span className="text-red-300">not running</span>}
              {!dbs.phpMyAdmin && ' · phpMyAdmin is not installed next to the panel.'}
              {dbs.phpMyAdmin && !dbs.phpMyAdmin.url && ` · phpMyAdmin (${dbs.phpMyAdmin.container}) runs but has no address the panel can see.`}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr>
                    <th className={th}>Server</th>
                    <th className={th}>Database</th>
                    <th className={th}>User</th>
                    <th className={th}>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {dbs.databases.map((d) => (
                    <tr key={d.serverId} className="border-t border-gray-800">
                      <td className={td}>
                        {d.serverName} <span className="text-xs text-gray-500">#{d.serverId}</span>
                      </td>
                      <td className={`${td} font-mono text-xs`}>{d.database ?? (d.error ? <span className="text-amber-300">{d.error}</span> : <span className="text-gray-500">no B3</span>)}</td>
                      <td className={`${td} font-mono text-xs`}>{d.user ?? '–'}</td>
                      <td className={td}>{formatBytes(d.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <ServerPicker servers={servers} value={serverId} onChange={onServer} />
      {serverId && (
        <Panel
          title="Backups of this server"
          icon={<Archive className="h-4 w-4" />}
          actions={
            <>
              <SmallButton
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const res = await adminApi.backupConfigs(serverId);
                    void loadBackups();
                    return `Configs backed up: ${res.files} file(s) in ${res.folder}.`;
                  })
                }
              >
                <Archive className="h-3.5 w-3.5" /> Back up configs
              </SmallButton>
              <SmallButton
                disabled={busy || !hasB3}
                onClick={() =>
                  void act(async () => {
                    const res = await adminApi.b3Backup(serverId);
                    void loadBackups();
                    return `B3 database backed up: ${res.file}.`;
                  })
                }
              >
                <Database className="h-3.5 w-3.5" /> Back up B3 database
              </SmallButton>
            </>
          }
        >
          {!backups ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : backups.length === 0 ? (
            <p className="text-sm text-gray-400">No backups yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px]">
                <thead>
                  <tr>
                    <th className={th}>Backup</th>
                    <th className={th}>Kind</th>
                    <th className={th}>Size</th>
                    <th className={th}>Made</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.path} className="border-t border-gray-800">
                      <td className={`${td} font-mono text-xs`}>
                        {b.kind === 'b3' ? (
                          <button
                            type="button"
                            className="text-[var(--color-cyan-400)] underline"
                            onClick={() => void apiClient.getServerDownloadUrl(Number(serverId), b.path).then((url) => window.open(url, '_blank'))}
                          >
                            {b.path}
                          </button>
                        ) : (
                          b.path
                        )}
                      </td>
                      <td className={td}>{b.kind === 'b3' ? 'B3 database' : 'Configs'}</td>
                      <td className={td}>{formatBytes(b.size)}</td>
                      <td className={td}>{new Date(b.time).toLocaleString()}</td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        <span className="inline-flex gap-1.5">
                          <SmallButton disabled={busy} onClick={() => setConfirm({ kind: 'restore', item: b })}>
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </SmallButton>
                          <SmallButton tone="danger" disabled={busy} onClick={() => setConfirm({ kind: 'delete', item: b })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </SmallButton>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <ConfirmationModal
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          if (!c) return;
          await act(async () => {
            if (c.kind === 'delete') {
              await adminApi.deleteBackup(serverId, c.item.path);
              void loadBackups();
              return `Deleted ${c.item.path}.`;
            }
            if (c.item.kind === 'b3') {
              await adminApi.b3Restore(serverId, c.item.path);
              return `B3 database restored from ${c.item.path}.`;
            }
            const res = await adminApi.restoreConfigs(serverId, c.item.path);
            return `${res.files} config file(s) restored from ${c.item.path}. Restart the server (and B3) to use them.`;
          });
        }}
        title={confirm?.kind === 'delete' ? 'Delete the backup' : 'Restore the backup'}
        message={
          confirm?.kind === 'delete'
            ? `Delete ${confirm.item.path}?`
            : confirm?.item.kind === 'b3'
              ? `Replace the B3 database with ${confirm.item.path}? Everything newer (players, bans, admins) is lost. B3 is stopped during the restore.`
              : `Put the configs from ${confirm?.item.path ?? ''} back? The current files with the same names are replaced.`
        }
        confirmText={confirm?.kind === 'delete' ? 'Delete' : 'Restore'}
        icon="danger"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </div>
  );
}
