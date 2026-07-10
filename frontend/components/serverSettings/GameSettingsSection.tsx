import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, Loader2, Save } from 'lucide-react';
import { AppButton, AppInput, AppSelect, AppSlider, AppToggle } from '../../src/ui/components';

// Shared settings form for games exposing a generic `{ settings: [...] }` API.
// Each game injects its own `load`/`save`; field rendering lives here.

export type GameSettingOption = { label: string; value: string };

export type GameSettingField = {
  key: string;
  label: string;
  description: string;
  type: 'select' | 'integer' | 'boolean' | 'string' | 'float';
  options?: GameSettingOption[] | string[];
  min?: number;
  max?: number;
  value: string | number | boolean;
};

export interface GameSettingsSectionProps {
  serverId: number;
  serverStatus?: string | null;
  canRead: boolean;
  canWrite: boolean;
  load: (serverId: number) => Promise<{ settings: GameSettingField[] }>;
  save: (
    serverId: number,
    changed: Record<string, string | number | boolean>
  ) => Promise<unknown>;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
  textSecondary: string;
}

function SectionCard({ title, children, borderColor, contentBg, textPrimary }: {
  title: string;
  children: React.ReactNode;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
}) {
  return (
    <div className={`${contentBg} border ${borderColor} rounded-lg p-4 space-y-3`}>
      <h4 className={`text-base font-semibold ${textPrimary}`}>{title}</h4>
      {children}
    </div>
  );
}

function ErrorMsg({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-sm text-red-400">{error}</p>;
}

function SuccessMsg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-emerald-400">
      <Check className="w-4 h-4" />
      {msg}
    </div>
  );
}

// Options may arrive as plain strings or {label,value} pairs — normalize both.
function normalizeOptions(options: GameSettingField['options']): GameSettingOption[] {
  if (!Array.isArray(options)) return [];
  return options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o));
}

// Float sliders need a decimal step; derive ~100 steps across the range.
function floatStep(min?: number, max?: number): number {
  if (min == null || max == null || max <= min) return 0.01;
  const step = (max - min) / 100;
  return step > 0 ? step : 0.01;
}

export function GameSettingsSection({
  serverId,
  serverStatus,
  canRead,
  canWrite,
  load,
  save,
  borderColor,
  contentBg,
  textPrimary,
  textSecondary,
}: GameSettingsSectionProps) {
  const [fields, setFields] = useState<GameSettingField[]>([]);
  const [edits, setEdits] = useState<Record<string, string | number | boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [openHelpKey, setOpenHelpKey] = useState<string | null>(null);
  const loaded = useRef(false);

  const loadSettings = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const data = await load(serverId);
      setFields(data.settings);
      const initial: Record<string, string | number | boolean> = {};
      data.settings.forEach((f) => { initial[f.key] = f.value; });
      setEdits(initial);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load server settings.');
    } finally {
      setLoading(false);
    }
  }, [serverId, canRead, load]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!canWrite || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const changed: Record<string, string | number | boolean> = {};
      fields.forEach((f) => {
        if (edits[f.key] !== f.value) changed[f.key] = edits[f.key];
      });
      if (Object.keys(changed).length === 0) {
        setSuccess('No changes to save.');
        setSaving(false);
        return;
      }
      await save(serverId, changed);
      setSuccess('Settings saved. Restart the server to apply the changes.');
      await loadSettings();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Server Settings" borderColor={borderColor} contentBg={contentBg} textPrimary={textPrimary}>
      {serverStatus !== 'running' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>The server is not running. You can still edit and save settings — restart the server to apply changes.</span>
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading settings...
        </div>
      )}
      <ErrorMsg error={error} />
      <SuccessMsg msg={success} />
      {!loading && fields.length === 0 && !error && (
        <p className={`text-sm ${textSecondary}`}>
          No settings available. The server may not have started yet.
        </p>
      )}
      {!loading && fields.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map((field) => (
              <div key={field.key} className={`rounded-lg border ${borderColor} bg-gp-surface-base/45 p-3 sm:p-4 flex flex-col justify-center`}>
                <div className={`grid grid-cols-1 items-center gap-3 sm:gap-4 w-full ${field.type === 'boolean' ? 'sm:grid-cols-[1fr_auto]' : 'sm:grid-cols-[minmax(185px,1.15fr)_minmax(0,1.1fr)]'}`}>
                  <div className="relative" data-setting-help>
                    <span className={`flex items-center gap-2 text-sm font-semibold leading-tight sm:pr-2 ${textPrimary}`}>
                      <span className="break-words">{field.label}</span>
                      {field.description && (
                        <AppButton
                          tone="ghost"
                          aria-label={`Info: ${field.label}`}
                          aria-expanded={openHelpKey === field.key}
                          onClick={() => setOpenHelpKey((cur) => (cur === field.key ? null : field.key))}
                          className="inline-flex h-5 shrink-0 items-center justify-center px-0.5 text-[var(--color-cyan-400)]/80 transition-colors hover:text-[var(--color-cyan-400)]"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </AppButton>
                      )}
                    </span>
                    {field.description && openHelpKey === field.key && (
                      <div className="absolute left-0 top-full z-20 mt-2 w-[260px] max-w-[calc(100vw-4rem)]">
                        <div className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 border-l border-t border-gray-700/80 bg-gp-surface-input" />
                        <div className="relative rounded-xl border border-gray-700/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(11,18,32,0.98))] px-3.5 py-3 text-xs font-normal leading-relaxed text-gray-300 shadow-[0_18px_40px_rgba(2,6,23,0.45)] backdrop-blur-sm">
                          {field.description}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    {field.type === 'boolean' && (
                      <div className="flex items-center justify-end">
                        <AppToggle
                          ariaLabel={field.label}
                          checked={String(edits[field.key] ?? field.value) === 'true'}
                          onChange={(checked) => setEdits((prev) => ({ ...prev, [field.key]: checked }))}
                          className="shrink-0"
                          disabled={!canWrite}
                        />
                      </div>
                    )}
                    {field.type === 'select' && (
                      <AppSelect
                        value={String(edits[field.key] ?? field.value)}
                        onChange={(v) => setEdits((prev) => ({ ...prev, [field.key]: v }))}
                        options={normalizeOptions(field.options)}
                        className="w-full gp-game-config-select"
                        disabled={!canWrite}
                      />
                    )}
                    {(field.type === 'integer' || field.type === 'float') && field.min != null && field.max != null ? (
                      <div className="space-y-1.5">
                        <AppSlider
                          min={field.min}
                          max={field.max}
                          step={field.type === 'float' ? floatStep(field.min, field.max) : 1}
                          value={Number(edits[field.key] ?? field.value)}
                          onChange={(e) => setEdits((prev) => ({
                            ...prev,
                            [field.key]: field.type === 'float' ? (parseFloat(e.target.value) || 0) : (parseInt(e.target.value) || 0),
                          }))}
                          aria-label={field.label}
                          disabled={!canWrite}
                        />
                        <div className={`grid grid-cols-3 items-center text-[11px] ${textSecondary}`}>
                          <span className="text-left">{field.min}</span>
                          <input
                            type="number"
                            min={field.min}
                            max={field.max}
                            step={field.type === 'float' ? 'any' : 1}
                            value={Number(edits[field.key] ?? field.value)}
                            onChange={(e) => {
                              const v = field.type === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value);
                              if (!isNaN(v)) setEdits((prev) => ({ ...prev, [field.key]: Math.min(field.max!, Math.max(field.min!, v)) }));
                            }}
                            disabled={!canWrite}
                            className="w-16 text-center text-xs font-semibold rounded px-1 py-0.5 mx-auto block bg-gp-surface-elevated border border-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-cyan-400)]/40 focus:border-[var(--color-cyan-400)] text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-right">{field.max}</span>
                        </div>
                      </div>
                    ) : (field.type === 'integer' || field.type === 'float') ? (
                      <AppInput
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.type === 'float' ? 'any' : 1}
                        value={String(edits[field.key] ?? field.value)}
                        onChange={(e) => setEdits((prev) => ({
                          ...prev,
                          [field.key]: field.type === 'float' ? (parseFloat(e.target.value) || 0) : (parseInt(e.target.value) || 0),
                        }))}
                        className="w-full px-3 py-2 bg-gp-surface-elevated border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-cyan-400)]/40 focus:border-[var(--color-cyan-400)]"
                        disabled={!canWrite}
                      />
                    ) : null}
                    {field.type === 'string' && (
                      <AppInput
                        type="text"
                        value={String(edits[field.key] ?? field.value)}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        className="w-full px-3 py-2 bg-gp-surface-elevated border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-cyan-400)]/40 focus:border-[var(--color-cyan-400)]"
                        disabled={!canWrite}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {canWrite && (
            <div className="flex justify-end pt-2">
              <AppButton
                tone="primary"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Saving…' : 'Save'}
              </AppButton>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
