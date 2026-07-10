import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Eye, EyeOff, HelpCircle, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { AppButton, AppToggle } from '../../src/ui/components';
import { apiClient } from '../../utils/api';
import { parseCs2Params, serializeCs2Params } from '../../utils/cs2Params';
import { CS2FrameworksSection } from './CS2FrameworksTab';

// ── Types ──────────────────────────────────────────────────────────────────

interface CS2Fields {
  hostname: string;
  sv_setsteamaccount: string;
  map: string;
  game_type: string;
  game_mode: string;
  maxplayers: string;
  sv_password: string;
  rcon_password: string;
}

const FIELD_ORDER: (keyof CS2Fields)[] = [
  'hostname', 'sv_setsteamaccount', 'map',
  'game_type', 'game_mode', 'maxplayers',
  'sv_password', 'rcon_password',
];

const DEFAULT_FIELDS: CS2Fields = {
  hostname: '',
  sv_setsteamaccount: '',
  map: '',
  game_type: '',
  game_mode: '',
  maxplayers: '',
  sv_password: '',
  rcon_password: '',
};

const DEFAULT_CS2_START_PARAMS = '+game_type 0 +game_mode 0 +map de_dust2';

const GAME_TYPES = [
  { value: '0', label: 'Classic' },
  { value: '1', label: 'Gungame' },
  { value: '2', label: 'Training' },
  { value: '3', label: 'Custom' },
];

const GAME_MODES: Record<string, { value: string; label: string }[]> = {
  '0': [
    { value: '0', label: 'Casual' },
    { value: '1', label: 'Competitive' },
    { value: '2', label: 'Wingman' },
  ],
  '1': [
    { value: '0', label: 'Arms Race' },
    { value: '1', label: 'Demolition' },
    { value: '2', label: 'Deathmatch' },
  ],
  '2': [{ value: '0', label: 'Training' }],
  '3': [{ value: '0', label: 'Custom' }],
};

const MAPS = [
  'de_dust2', 'de_mirage', 'de_inferno', 'de_overpass', 'de_nuke',
  'de_ancient', 'de_anubis', 'de_cache',
  'cs_office', 'cs_italy', 'cs_alpine',
  'ar_baggage', 'ar_pool_day',
];

const MAP_LABELS: Record<string, string> = {
  'de_dust2': 'Dust II',
  'de_mirage': 'Mirage',
  'de_inferno': 'Inferno',
  'de_overpass': 'Overpass',
  'de_nuke': 'Nuke',
  'de_ancient': 'Ancient',
  'de_anubis': 'Anubis',
  'de_cache': 'Cache',
  'cs_office': 'Office',
  'cs_italy': 'Italy',
  'cs_alpine': 'Alpine',
  'ar_baggage': 'Baggage',
  'ar_pool_day': 'Pool Day',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function envFromServer(server: any): Record<string, string> {
  const raw = server?.env ?? server?.env_json ?? {};
  const arrayToRecord = (arr: string[]): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const item of arr) {
      const idx = item.indexOf('=');
      if (idx >= 0) out[item.slice(0, idx)] = item.slice(idx + 1);
    }
    return out;
  };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? arrayToRecord(parsed as string[]) : (parsed as Record<string, string>);
    } catch { return {}; }
  }
  if (Array.isArray(raw)) return arrayToRecord(raw as string[]);
  if (typeof raw === 'object' && raw !== null) return raw as Record<string, string>;
  return {};
}

function paramsToFields(params: Record<string, string>): CS2Fields {
  return {
    hostname: params['hostname'] ?? '',
    sv_setsteamaccount: params['sv_setsteamaccount'] ?? '',
    map: params['map'] ?? '',
    game_type: params['game_type'] ?? '',
    game_mode: params['game_mode'] ?? '',
    maxplayers: params['maxplayers'] ?? '',
    sv_password: params['sv_password'] ?? '',
    rcon_password: params['rcon_password'] ?? '',
  };
}

function fieldsToParams(fields: CS2Fields): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of FIELD_ORDER) {
    if (fields[key] !== '') out[key] = fields[key];
  }
  return out;
}

// VAC is on by default; disabling it means adding the `-insecure` launch flag.
// It is not a `+key value` param, so it is handled outside (de)serialization.
const INSECURE_RE = /(^|\s)-insecure(\s|$)/i;

function buildStartParams(fields: CS2Fields, vacEnabled: boolean): string {
  const base = serializeCs2Params(fieldsToParams(fields));
  if (vacEnabled) return base;
  return base ? `${base} -insecure` : '-insecure';
}

const FORBIDDEN_RE = /[ \t&;|<>(){}[\]*?~`$#'"!]/;
function containsForbidden(v: string): boolean { return FORBIDDEN_RE.test(v); }

const SENSITIVE_KEY_RE = /password|passwd|pwd|secret|token|rcon/i;
const MANAGED_ENV_KEYS = new Set(['CS2_START_PARAMS']);

type EnvEntry = { key: string; value: string };

function envToEntries(env: Record<string, string>): EnvEntry[] {
  return Object.entries(env)
    .filter(([k]) => !MANAGED_ENV_KEYS.has(k))
    .map(([key, value]) => ({ key, value }));
}

function entriesToEnv(entries: EnvEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key.trim()) out[key.trim()] = value;
  }
  return out;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ComboInput({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  inputCls,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  inputCls: string;
}) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Filter only when the user is actively typing, otherwise show all
  const filtered = typing && value.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(value.toLowerCase()) ||
          o.value.toLowerCase().includes(value.toLowerCase()),
      )
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setTyping(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <input
        type="search"
        className={`${inputCls} pr-8 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden`}
        value={value}
        onChange={(e) => { onChange(e.target.value); setTyping(true); setOpen(true); }}
        onFocus={() => { setTyping(false); setOpen(true); }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
      {open && filtered.length > 0 && !disabled && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 rounded-lg border border-gray-700 bg-gray-900 shadow-xl max-h-52 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                opt.value === value
                  ? 'bg-[var(--color-cyan-400)]/10 text-[var(--color-cyan-400)]'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt.value); setTyping(false); setOpen(false); }}
            >
              <span>{opt.label}</span>
              {opt.value !== opt.label && (
                <span className="font-mono text-gray-500 shrink-0">{opt.value}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center gap-1.5 mb-1.5">
      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      {tooltip && (
        <>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-300 transition-colors"
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
          {show && (
            <div className="absolute bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-3rem)] z-20 bg-gray-900 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-2 shadow-xl break-words">
              {tooltip}
              <div className="absolute top-full left-3 border-4 border-transparent border-t-gray-700" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PasswordField({
  value, onChange, disabled, placeholder, inputCls,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
  inputCls: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className={`${inputCls} pr-10`}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ── EnvVarsSection ─────────────────────────────────────────────────────────
// Currently unused; exported to satisfy noUnusedLocals.
export function EnvVarsSection({
  serverId, fullEnv, canEdit, borderColor, contentBg, textPrimary, textSecondary, inputBg, inputBorder, onRefreshRequested,
}: {
  serverId: number;
  fullEnv: Record<string, string>;
  canEdit: boolean;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
  textSecondary: string;
  inputBg: string;
  inputBorder: string;
  onRefreshRequested: () => void;
}) {
  const [entries, setEntries] = useState<EnvEntry[]>(() => envToEntries(fullEnv));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [shownIndexes, setShownIndexes] = useState<Set<number>>(new Set());

  const prevFullEnvRef = useRef(fullEnv);
  useEffect(() => {
    if (prevFullEnvRef.current !== fullEnv) {
      prevFullEnvRef.current = fullEnv;
      setEntries(envToEntries(fullEnv));
    }
  }, [fullEnv]);

  const toggleShow = (i: number) =>
    setShownIndexes((prev) => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; });

  const handleSave = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const managedPart: Record<string, string> = {};
      for (const key of MANAGED_ENV_KEYS) {
        if (key in fullEnv) managedPart[key] = fullEnv[key];
      }
      const newEnv = { ...managedPart, ...entriesToEnv(entries) };
      await apiClient.updateServer(serverId, { env: newEnv });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onRefreshRequested();
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || err?.message || 'Failed to save environment variables.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = `w-full px-3 py-2 rounded-lg text-sm ${inputBg} border ${inputBorder} ${textPrimary} focus:outline-none focus:border-[var(--color-cyan-400)] disabled:opacity-50 transition-colors`;

  return (
    <div className={`${contentBg} border ${borderColor} rounded-lg p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-3">
        <h4 className={`text-base font-semibold ${textPrimary}`}>Environment Variables</h4>
        <AppButton
          onClick={onRefreshRequested}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-gray-600 bg-transparent text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </AppButton>
      </div>

      {entries.length === 0 && (
        <p className={`text-sm ${textSecondary} italic`}>No additional variables.</p>
      )}

      <div className="space-y-2">
        {entries.map((entry, i) => {
          const isSensitive = SENSITIVE_KEY_RE.test(entry.key);
          const shown = shownIndexes.has(i);
          return (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={entry.key}
                disabled={!canEdit}
                onChange={(e) => setEntries((prev) => prev.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))}
                placeholder="KEY"
                className={`${inputCls} w-44 shrink-0 font-mono`}
              />
              <span className={textSecondary}>=</span>
              {isSensitive ? (
                <div className="relative flex-1">
                  <input
                    type={shown ? 'text' : 'password'}
                    value={entry.value}
                    disabled={!canEdit}
                    onChange={(e) => setEntries((prev) => prev.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))}
                    placeholder="value"
                    className={`${inputCls} pr-10`}
                  />
                  <button type="button" tabIndex={-1} onClick={() => toggleShow(i)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors">
                    {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={entry.value}
                  disabled={!canEdit}
                  onChange={(e) => setEntries((prev) => prev.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))}
                  placeholder="value"
                  className={`${inputCls} flex-1`}
                />
              )}
              {canEdit && (
                <button type="button" onClick={() => setEntries((prev) => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <button type="button" onClick={() => setEntries((prev) => [...prev, { key: '', value: '' }])}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-dashed border-gray-600 text-gray-400 hover:border-[var(--color-cyan-400)]/50 hover:text-[var(--color-cyan-400)] transition-colors w-full justify-center">
          <Plus className="w-3.5 h-3.5" />
          Add variable
        </button>
      )}

      {saveError && <p className="text-sm text-red-400">{saveError}</p>}
      {saveSuccess && (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <Check className="w-4 h-4" />
          Environment variables saved.
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <AppButton tone="primary" onClick={() => void handleSave()} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-60">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : 'Save'}
          </AppButton>
        </div>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

type CS2SubTab = 'settings' | 'frameworks';

export interface CS2SectionsProps {
  serverId: number;
  serverStatus?: string | null;
  canEdit: boolean;
  canWriteFrameworks: boolean;
  /** Whether the caller holds `server.env`; the env-backed "Settings" sub-tab is hidden when false. */
  canManageEnv: boolean;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
  textSecondary: string;
  inputBg: string;
  inputBorder: string;
}

export function CS2Sections({
  serverId,
  serverStatus,
  canEdit,
  canWriteFrameworks,
  canManageEnv,
  borderColor,
  contentBg,
  textPrimary,
  textSecondary,
  inputBg,
  inputBorder,
}: CS2SectionsProps) {
  const [fields, setFields] = useState<CS2Fields>(DEFAULT_FIELDS);
  const [vacEnabled, setVacEnabled] = useState(true);
  const [updateOnStart, setUpdateOnStart] = useState(true);
  const [rawParams, setRawParams] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CS2Fields, string>>>({});
  const rawEditingRef = useRef(false);
  const isRunning = serverStatus === 'running';

  // The env-backed "Settings" sub-tab needs `server.env`; Frameworks is always available.
  const availableTabs: CS2SubTab[] = [
    ...(canManageEnv ? (['settings'] as CS2SubTab[]) : []),
    'frameworks',
  ];
  const [activeTab, setActiveTab] = useState<CS2SubTab>(availableTabs[0]);
  const [visited, setVisited] = useState<Set<CS2SubTab>>(() => new Set([availableTabs[0]]));

  const switchTab = (id: CS2SubTab) => {
    setActiveTab(id);
    setVisited((prev) => new Set([...prev, id]));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const server = await apiClient.getServer(serverId);
      const env = envFromServer(server);
      const raw = env['CS2_START_PARAMS'] ?? DEFAULT_CS2_START_PARAMS;
      const params = parseCs2Params(raw);
      setFields(paramsToFields(params));
      setVacEnabled(!INSECURE_RE.test(raw));
      setRawParams(raw);
      setUpdateOnStart((env['CS2_UPDATE_ON_START'] ?? 'true') !== 'false');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load server configuration.');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { void load(); }, [load]);

  const handleFieldChange = (key: keyof CS2Fields, value: string) => {
    const updated = { ...fields, [key]: value };
    if (key === 'game_type') updated.game_mode = '';
    setFields(updated);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (containsForbidden(value)) {
        next[key] = 'Caractère interdit (espace, & ; | < > $ " \' etc.)';
      } else {
        delete next[key];
      }
      return next;
    });
    if (!rawEditingRef.current) {
      setRawParams(buildStartParams(updated, vacEnabled));
    }
  };

  const handleVacChange = (enabled: boolean) => {
    setVacEnabled(enabled);
    if (!rawEditingRef.current) {
      setRawParams(buildStartParams(fields, enabled));
    }
  };

  const handleSave = async () => {
    if (!canEdit || saving) return;
    const hasFieldErrors = Object.values(fieldErrors).some(Boolean) ||
      (FIELD_ORDER.filter((k) => k !== 'maxplayers') as (keyof CS2Fields)[]).some((k) => containsForbidden(fields[k]));
    if (hasFieldErrors) {
      setError('Un ou plusieurs champs contiennent des caractères interdits. Corrigez-les avant de sauvegarder.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      // Re-fetch the latest env and change only the start params, so a separate
      // env editor (e.g. the update-on-start toggle) is not clobbered.
      const fresh = await apiClient.getServer(serverId);
      const newEnv = {
        ...envFromServer(fresh),
        CS2_START_PARAMS: rawParams,
        CS2_UPDATE_ON_START: updateOnStart ? 'true' : 'false',
      };
      await apiClient.updateServer(serverId, { env: newEnv });
      if (isRunning) await apiClient.restartServer(serverId);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = `w-full px-3 py-2 rounded-lg text-sm ${inputBg} border ${inputBorder} ${textPrimary} focus:outline-none focus:border-[var(--color-cyan-400)] disabled:opacity-50 transition-colors`;

  const getInputCls = (key: keyof CS2Fields) => {
    if (!fieldErrors[key]) return inputCls;
    return inputCls
      .replace(inputBorder, 'border-red-500')
      .replace('focus:border-[var(--color-cyan-400)]', 'focus:border-red-400');
  };
  const fieldErr = (key: keyof CS2Fields) =>
    fieldErrors[key]
      ? <p className="mt-1 text-xs text-red-400">{fieldErrors[key]}</p>
      : null;

  const currentModes = GAME_MODES[fields.game_type] ?? [];

  return (
    <div>
      {/* Sub-tab bar */}
      <div className={`flex flex-wrap border-b ${borderColor} mb-3`}>
        {availableTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => switchTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-[var(--color-cyan-400)] text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
            }`}
          >
            {tab === 'settings' ? 'Settings' : 'Frameworks'}
          </button>
        ))}
      </div>

      {/* Settings tab — env-backed, only when the caller holds server.env */}
      {canManageEnv && visited.has('settings') && (
        <div className={activeTab !== 'settings' ? 'hidden' : 'space-y-4'}>
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading configuration…
            </div>
          ) : (
            <>
              {/* General */}
              <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-5 space-y-4`}>
                <h4 className={`text-sm font-semibold ${textPrimary}`}>General</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel label="Server name" />
                    <input
                      type="text" className={getInputCls('hostname')} disabled={!canEdit}
                      placeholder="My CS2 Server"
                      value={fields.hostname}
                      onChange={(e) => handleFieldChange('hostname', e.target.value)}
                    />
                    {fieldErr('hostname')}
                  </div>
                  <div>
                    <FieldLabel label="Max players" />
                    <input
                      type="number" min={1} max={64} className={inputCls} disabled={!canEdit}
                      placeholder="10"
                      value={fields.maxplayers}
                      onChange={(e) => handleFieldChange('maxplayers', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Map & Mode */}
              <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-5 space-y-4`}>
                <h4 className={`text-sm font-semibold ${textPrimary}`}>Map & Game Mode</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <FieldLabel label="Map" />
                    <ComboInput
                      value={fields.map}
                      onChange={(v) => handleFieldChange('map', v)}
                      options={MAPS.map((m) => ({ value: m, label: MAP_LABELS[m] ?? m }))}
                      placeholder="e.g. de_dust2"
                      disabled={!canEdit}
                      inputCls={getInputCls('map')}
                    />
                    {fieldErr('map')}
                  </div>
                  <div>
                    <FieldLabel label="Game type" />
                    <ComboInput
                      value={fields.game_type}
                      onChange={(v) => handleFieldChange('game_type', v)}
                      options={GAME_TYPES}
                      placeholder="e.g. 0"
                      disabled={!canEdit}
                      inputCls={getInputCls('game_type')}
                    />
                    {fieldErr('game_type')}
                  </div>
                  <div>
                    <FieldLabel label="Game mode" />
                    <ComboInput
                      value={fields.game_mode}
                      onChange={(v) => handleFieldChange('game_mode', v)}
                      options={currentModes}
                      placeholder={fields.game_type ? 'e.g. 0' : '— Select game type first —'}
                      disabled={!canEdit || !fields.game_type}
                      inputCls={getInputCls('game_mode')}
                    />
                    {fieldErr('game_mode')}
                  </div>
                </div>
              </div>

              {/* Security */}
              <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-5 space-y-4`}>
                <h4 className={`text-sm font-semibold ${textPrimary}`}>Security</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel
                      label="Server password"
                      tooltip="Players will need to enter this password to join. Leave empty to make the server public."
                    />
                    <PasswordField
                      value={fields.sv_password}
                      onChange={(v) => handleFieldChange('sv_password', v)}
                      disabled={!canEdit}
                      placeholder="Leave empty for public"
                      inputCls={getInputCls('sv_password')}
                    />
                    {fieldErr('sv_password')}
                  </div>
                  <div>
                    <FieldLabel
                      label="Admin password (RCON)"
                      tooltip="Used to remotely control the server via console commands. Keep it secret."
                    />
                    <PasswordField
                      value={fields.rcon_password}
                      onChange={(v) => handleFieldChange('rcon_password', v)}
                      disabled={!canEdit}
                      placeholder="Remote admin password"
                      inputCls={getInputCls('rcon_password')}
                    />
                    {fieldErr('rcon_password')}
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel
                      label="Steam GSL token"
                      tooltip="Required to make your server appear in the official server browser. Get it from steamcommunity.com/dev/managegameservers."
                    />
                    <PasswordField
                      value={fields.sv_setsteamaccount}
                      onChange={(v) => handleFieldChange('sv_setsteamaccount', v)}
                      disabled={!canEdit}
                      placeholder="Paste your token here"
                      inputCls={getInputCls('sv_setsteamaccount')}
                    />
                    {fieldErr('sv_setsteamaccount')}
                  </div>
                  <div className={`sm:col-span-2 flex items-center justify-between gap-4 rounded-lg border ${borderColor} p-3`}>
                    <div className="-mb-1.5 min-w-0">
                      <FieldLabel
                        label="VAC anti-cheat"
                        tooltip="Valve's official anti-cheat. Only turn it off for test or private servers."
                      />
                    </div>
                    <AppToggle
                      ariaLabel="Toggle VAC anti-cheat"
                      checked={vacEnabled}
                      onChange={handleVacChange}
                      disabled={!canEdit}
                      className="shrink-0"
                    />
                  </div>
                </div>
              </div>

              {/* Updates */}
              <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-5 space-y-4`}>
                <h4 className={`text-sm font-semibold ${textPrimary}`}>Updates</h4>
                <div className={`flex items-center justify-between gap-4 rounded-lg border ${borderColor} p-3`}>
                  <div className="-mb-1.5 min-w-0">
                    <FieldLabel
                      label="Update on start"
                      tooltip="When enabled, the server checks for and installs game updates via SteamCMD each time it starts."
                    />
                  </div>
                  <AppToggle
                    ariaLabel="Toggle update on start"
                    checked={updateOnStart}
                    onChange={setUpdateOnStart}
                    disabled={!canEdit}
                    className="shrink-0"
                  />
                </div>
              </div>

              {/* Feedback */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-400">
                  <Check className="w-4 h-4" />
                  {isRunning ? 'Configuration saved. Server is restarting…' : 'Configuration saved. It will apply on next start.'}
                </div>
              )}

              {/* Actions */}
              {canEdit && (
                <div className="flex justify-end pb-2">
                  <AppButton
                    tone="primary"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving…' : isRunning ? 'Save & Restart' : 'Save'}
                  </AppButton>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Frameworks tab */}
      {visited.has('frameworks') && (
        <div className={activeTab !== 'frameworks' ? 'hidden' : ''}>
          <CS2FrameworksSection
            serverId={serverId}
            serverStatus={serverStatus}
            canWrite={canWriteFrameworks}
            borderColor={borderColor}
            contentBg={contentBg}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
        </div>
      )}
    </div>
  );
}

export type CS2ConfigTabProps = CS2SectionsProps & { serverId?: number | null };
export function CS2ConfigTab(props: CS2ConfigTabProps) {
  if (!props.serverId) return null;
  return <CS2Sections {...props} serverId={props.serverId} />;
}
