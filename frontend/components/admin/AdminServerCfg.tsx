import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCog, Plus, RotateCw, Save } from 'lucide-react';
import { adminApi, apiError } from '../../utils/adminApi';
import { Note, Panel, SmallButton, inputCls } from './shared';

// Server config tab: main/cod4server.cfg (what the server loads at start) as fields, or as text.
// The text is what is saved; a field changes its own "set" line, a field the file does not have yet is added at the end.

type CfgLine = { key: string; value: string; line: number };

// set / seta / sets <key> "<value>" (or a value without quotes), comments after // ignored
const SET_LINE = /^\s*(set[as]?)\s+([A-Za-z0-9_]+)\s+(?:"([^"]*)"|([^\s/]+))?/i;

function parseCfg(text: string): CfgLine[] {
  const found: CfgLine[] = [];
  text.split('\n').forEach((raw, line) => {
    const m = SET_LINE.exec(raw);
    if (m) found.push({ key: m[2], value: m[3] ?? m[4] ?? '', line });
  });
  return found;
}

function setValue(text: string, key: string, value: string): string {
  const lines = text.split('\n');
  const clean = value.replace(/"/g, "'");
  let changed = false;
  const next = lines.map((raw) => {
    const m = SET_LINE.exec(raw);
    if (!m || m[2].toLowerCase() !== key.toLowerCase()) return raw;
    changed = true;
    const comment = /\s\/\/.*$/.exec(raw.slice(m[0].length))?.[0] ?? '';
    return `${raw.match(/^\s*/)?.[0] ?? ''}${m[1]} ${m[2]} "${clean}"${comment}`;
  });
  if (!changed) {
    if (next.length > 0 && next[next.length - 1].trim() === '') next.splice(next.length - 1, 0, `set ${key} "${clean}"`);
    else next.push(`set ${key} "${clean}"`);
  }
  return next.join('\n');
}

// the settings most servers change, with a short explanation
const COMMON: Array<{ key: string; label: string; kind?: 'bool' | 'number' | 'secret' }> = [
  { key: 'sv_hostname', label: 'Server name (colours ^1 … ^9)' },
  { key: 'g_motd', label: 'Message of the day' },
  { key: 'sv_maxclients', label: 'Slots', kind: 'number' },
  { key: 'g_password', label: 'Join password (empty = public)', kind: 'secret' },
  { key: 'sv_privateClients', label: 'Private slots', kind: 'number' },
  { key: 'sv_privatePassword', label: 'Private slot password', kind: 'secret' },
  { key: 'g_gametype', label: 'Game type (war, dm, sd, koth, sab, dom)' },
  { key: 'scr_hardcore', label: 'Hardcore', kind: 'bool' },
  { key: 'scr_oldschool', label: 'Old school', kind: 'bool' },
  { key: 'scr_game_allowkillcam', label: 'Killcam', kind: 'bool' },
  { key: 'scr_teambalance', label: 'Auto team balance', kind: 'bool' },
  { key: 'g_allowvote', label: 'Voting', kind: 'bool' },
  { key: 'sv_pure', label: 'Pure (clients need the same files)', kind: 'bool' },
  { key: 'sv_voice', label: 'Voice chat', kind: 'bool' },
  { key: 'sv_floodProtect', label: 'Flood protection', kind: 'bool' },
  { key: 'sv_maxRate', label: 'Max rate', kind: 'number' },
  { key: 'sv_maxPing', label: 'Max ping (0 = none)', kind: 'number' },
  { key: 'sv_kickBanTime', label: 'Kick ban time (seconds)', kind: 'number' },
  { key: 'g_logsync', label: 'Log sync (B3 needs 1 or 2)', kind: 'number' },
  { key: 'g_log', label: 'Log file (B3 reads it)' },
];

export function AdminServerCfg({ serverId }: { serverId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [file, setFile] = useState('');
  const [view, setView] = useState<'fields' | 'text'>('fields');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');

  const load = useCallback(async () => {
    setText(null);
    setResult(null);
    try {
      const data = await adminApi.serverCfg(serverId);
      setText(data.content);
      setSaved(data.content);
      setFile(data.file);
      if (!data.exists) setResult({ ok: false, text: `${data.file} does not exist yet: saving creates it.` });
    } catch (e) {
      setResult({ ok: false, text: apiError(e, 'Could not read server.cfg.') });
    }
  }, [serverId]);

  useEffect(() => {
    void load();
  }, [load]);

  const values = useMemo(() => parseCfg(text ?? ''), [text]);
  const valueOf = (key: string) => values.find((v) => v.key.toLowerCase() === key.toLowerCase())?.value;
  const others = values.filter((v) => !COMMON.some((c) => c.key.toLowerCase() === v.key.toLowerCase()));
  const dirty = text !== null && text !== saved;

  const save = async () => {
    if (text === null) return;
    setBusy(true);
    setResult(null);
    try {
      await adminApi.saveServerCfg(serverId, text);
      setSaved(text);
      setResult({ ok: true, text: 'Saved. The server uses it at its next start (or map change for most settings).' });
    } catch (e) {
      setResult({ ok: false, text: apiError(e, 'Could not save.') });
    } finally {
      setBusy(false);
    }
  };

  const change = (key: string, value: string) => setText((cur) => setValue(cur ?? '', key, value));

  const field = (key: string, label: string, kind?: 'bool' | 'number' | 'secret') => {
    const value = valueOf(key);
    return (
      <label key={key} className="flex flex-col gap-1 text-xs text-gray-400">
        <span>
          {label} <code className="text-gray-500">{key}</code>
          {value === undefined && <span className="ml-1 text-amber-300/80">(not set)</span>}
        </span>
        {kind === 'bool' ? (
          <select className={inputCls} value={value ?? ''} onChange={(e) => change(key, e.target.value)}>
            <option value="" disabled>
              –
            </option>
            <option value="1">On (1)</option>
            <option value="0">Off (0)</option>
          </select>
        ) : (
          <input
            className={inputCls}
            type={kind === 'number' ? 'number' : 'text'}
            value={value ?? ''}
            placeholder="–"
            autoComplete="off"
            onChange={(e) => change(key, e.target.value)}
          />
        )}
      </label>
    );
  };

  return (
    <div className="space-y-4">
      <Note result={result} />
      <Panel
        title={`server.cfg${dirty ? ' · not saved' : ''}`}
        icon={<FileCog className="h-4 w-4" />}
        actions={
          <>
            <SmallButton onClick={() => setView(view === 'fields' ? 'text' : 'fields')}>{view === 'fields' ? 'Edit as text' : 'Edit as fields'}</SmallButton>
            <SmallButton disabled={busy} onClick={() => void load()}>
              <RotateCw className="h-3.5 w-3.5" /> Reload
            </SmallButton>
            <SmallButton tone="good" disabled={busy || !dirty} onClick={() => void save()}>
              <Save className="h-3.5 w-3.5" /> Save
            </SmallButton>
          </>
        }
      >
        <p className="mb-3 text-xs text-gray-400">
          {file}. The RCON password, slots and FastDL come from the panel's start line and win over this file.
        </p>
        {text === null ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : view === 'text' ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className={`${inputCls} h-[60vh] w-full font-mono text-xs`}
          />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{COMMON.map((c) => field(c.key, c.label, c.kind))}</div>
            {others.length > 0 && (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Everything else in the file</h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{others.map((o) => field(o.key, o.key))}</div>
              </>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={inputCls}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))}
                placeholder="new setting, e.g. scr_war_scorelimit"
              />
              <SmallButton
                disabled={!newKey || valueOf(newKey) !== undefined}
                onClick={() => {
                  change(newKey, '');
                  setNewKey('');
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </SmallButton>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
