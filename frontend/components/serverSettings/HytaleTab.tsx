import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, Loader2 } from 'lucide-react';
import { AppButton, AppInput, AppSlider, AppToggle } from '../../src/ui/components';
import { apiClient } from '../../utils/api';
import { ModsSection } from './ModsSection';

// ── Types ──────────────────────────────────────────────────────────────────

type HytaleSettingField = {
  key: string;
  label: string;
  description: string;
  type: 'integer' | 'boolean' | 'string';
  min?: number;
  max?: number;
  value: string | number | boolean;
};

export interface HytaleSectionsProps {
  serverId: number;
  serverStatus?: string | null;
  canReadSettings: boolean;
  canWriteSettings: boolean;
  canReadMods: boolean;
  canWriteMods: boolean;
  advancedLinksNode?: React.ReactNode;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
  textSecondary: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Settings Section ───────────────────────────────────────────────────────

function SettingsSection({
  serverId, serverStatus, canRead, canWrite, borderColor, contentBg, textPrimary, textSecondary,
}: {
  serverId: number; serverStatus?: string | null; canRead: boolean; canWrite: boolean;
  borderColor: string; contentBg: string; textPrimary: string; textSecondary: string;
}) {
  const [fields, setFields] = useState<HytaleSettingField[]>([]);
  const [edits, setEdits] = useState<Record<string, string | number | boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [openHelpKey, setOpenHelpKey] = useState<string | null>(null);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getHytaleSettings(serverId);
      setFields(data.settings);
      const initial: Record<string, string | number | boolean> = {};
      data.settings.forEach((f) => { initial[f.key] = f.value; });
      setEdits(initial);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load server settings.');
    } finally {
      setLoading(false);
    }
  }, [serverId, canRead]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load();
  }, [load]);

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
      await apiClient.patchHytaleSettings(serverId, changed);
      setSuccess('Settings saved. Restart the server to apply changes.');
      await load();
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
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(185px,1.15fr)_minmax(0,1.1fr)] items-center gap-3 sm:gap-4 w-full">
                  <div className="relative" data-hytale-help>
                    <span className={`flex items-center gap-2 text-sm font-semibold leading-tight sm:pr-2 ${textPrimary}`}>
                      <span className="break-all">{field.label}</span>
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
                    {field.type === 'integer' && field.min != null && field.max != null ? (
                      <div className="space-y-1.5">
                        <AppSlider
                          min={field.min}
                          max={field.max}
                          step={1}
                          value={Number(edits[field.key] ?? field.value)}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [field.key]: parseInt(e.target.value) || 0 }))}
                          aria-label={field.label}
                          disabled={!canWrite}
                        />
                        <div className={`grid grid-cols-3 items-center text-[11px] ${textSecondary}`}>
                          <span className="text-left">{field.min}</span>
                          <input
                            type="number"
                            min={field.min}
                            max={field.max}
                            value={Number(edits[field.key] ?? field.value)}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              if (!isNaN(v)) setEdits((prev) => ({ ...prev, [field.key]: Math.min(field.max!, Math.max(field.min!, v)) }));
                            }}
                            disabled={!canWrite}
                            className="w-14 text-center text-xs font-semibold rounded px-1 py-0.5 mx-auto block bg-gp-surface-elevated border border-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-cyan-400)]/40 focus:border-[var(--color-cyan-400)] text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-right">{field.max}</span>
                        </div>
                      </div>
                    ) : field.type === 'integer' ? (
                      <AppInput
                        type="number"
                        min={field.min}
                        max={field.max}
                        value={String(edits[field.key] ?? field.value)}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [field.key]: parseInt(e.target.value) || 0 }))}
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
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Saving…' : 'Save & Restart'}
              </AppButton>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

// ── HytaleSections (horizontal sub-tabs) ─────────────────────────────────

type HytaleSubTab = 'settings' | 'mods';

export function HytaleSections({
  serverId,
  serverStatus,
  canReadSettings,
  canWriteSettings,
  canReadMods,
  canWriteMods,
  advancedLinksNode,
  borderColor,
  contentBg,
  textPrimary,
  textSecondary,
}: HytaleSectionsProps) {
  const tabs: { id: HytaleSubTab; label: string }[] = [
    canReadSettings && { id: 'settings', label: 'Server Settings' },
    canReadMods     && { id: 'mods',     label: 'Mods' },
  ].filter(Boolean) as { id: HytaleSubTab; label: string }[];

  const firstTab = tabs[0]?.id ?? 'settings';
  const [activeTab, setActiveTab] = useState<HytaleSubTab>(firstTab);
  const [visited, setVisited] = useState<Set<HytaleSubTab>>(() => new Set([firstTab]));

  const switchTab = (id: HytaleSubTab) => {
    setActiveTab(id);
    setVisited((prev) => new Set([...prev, id]));
  };

  if (tabs.length === 0) return null;

  return (
    <div>
      {/* Horizontal tab bar — only shown when there are multiple tabs */}
      {tabs.length > 1 && (
        <div className={`flex flex-wrap border-b ${borderColor} mb-3 gap-0`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-[var(--color-cyan-400)] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {visited.has('settings') && canReadSettings && (
        <div className={activeTab !== 'settings' ? 'hidden' : ''}>
          <SettingsSection
            serverId={serverId}
            serverStatus={serverStatus}
            canRead={canReadSettings}
            canWrite={canWriteSettings}
            borderColor={borderColor}
            contentBg={contentBg}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
          <div className="mt-3">{advancedLinksNode}</div>
        </div>
      )}
      {visited.has('mods') && canReadMods && (
        <div className={activeTab !== 'mods' ? 'hidden' : ''}>
          <ModsSection
            serverId={serverId}
            kind="mods"
            apiKind="hytale"
            canRead={canReadMods}
            canWrite={canWriteMods}
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
