import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCode2, Loader2, Package, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { AppButton } from '../../src/ui/components';
import { apiClient } from '../../utils/api';

// ── Types ──────────────────────────────────────────────────────────────────

type ModEntry = {
  name: string;
  type: string;
  size: number;
  modifiedAt: string;
};

type UploadItem = {
  id: string;
  name: string;
  progress: number;
  error?: string;
  done: boolean;
};

export interface ModsSectionProps {
  serverId: number;
  kind: 'mods' | 'plugins';
  apiKind: 'hytale' | 'minecraft';
  canRead: boolean;
  canWrite: boolean;
  borderColor: string;
  contentBg: string;
  textPrimary: string;
  textSecondary: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ── ModsSection ────────────────────────────────────────────────────────────

export function ModsSection({
  serverId, kind, apiKind, canRead, canWrite,
  borderColor, contentBg, textPrimary, textSecondary,
}: ModsSectionProps) {
  const [entries, setEntries] = useState<ModEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  const label = kind === 'plugins' ? 'Plugins' : 'Mods';
  const singularLabel = kind === 'plugins' ? 'plugin' : 'mod';

  const loadEntries = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const data = apiKind === 'hytale'
        ? await apiClient.listHytaleMods(serverId)
        : await apiClient.listMinecraftAddons(serverId);
      setEntries((data.entries ?? []).filter((e) => e.type !== 'dir'));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || `Failed to load ${kind}.`);
    } finally {
      setLoading(false);
    }
  }, [serverId, canRead, apiKind, kind]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void loadEntries();
  }, [loadEntries]);

  const handleFiles = useCallback(async (files: File[]) => {
    if (!canWrite || files.length === 0) return;

    const newItems: UploadItem[] = files.map((f) => ({
      id: `${Date.now()}-${Math.random()}-${f.name}`,
      name: f.name,
      progress: 0,
      done: false,
    }));
    setUploadQueue((prev) => [...prev, ...newItems]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const item = newItems[i];
      try {
        const uploadFn = apiKind === 'hytale'
          ? apiClient.uploadHytaleMod.bind(apiClient)
          : apiClient.uploadMinecraftAddon.bind(apiClient);
        await uploadFn(serverId, file, (pct) => {
          setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, progress: pct } : q));
        });
        setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, progress: 100, done: true } : q));
      } catch (err: any) {
        const msg = err?.response?.data?.error || err?.message || 'Upload failed.';
        setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, error: msg, done: true } : q));
      }
    }

    await loadEntries();
    setTimeout(() => {
      setUploadQueue((prev) => prev.filter((q) => !q.done || Boolean(q.error)));
    }, 3000);
  }, [serverId, canWrite, apiKind, loadEntries]);

  const handleDelete = async (name: string) => {
    if (!canWrite) return;
    setDeleting((prev) => new Set([...prev, name]));
    try {
      if (apiKind === 'hytale') {
        await apiClient.deleteHytaleMods(serverId, [`/${name}`]);
      } else {
        await apiClient.deleteMinecraftAddons(serverId, [`/${name}`]);
      }
      await loadEntries();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || `Failed to delete ${name}.`);
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(name); return s; });
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (canWrite) setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canWrite) return;
    void handleFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      {canWrite && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl px-6 py-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-150 ${
            isDragging
              ? 'border-[var(--color-cyan-400)] bg-[var(--color-cyan-400)]/8'
              : 'border-gray-300 dark:border-gray-600/60 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
          }`}
        >
          <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors duration-150 ${isDragging ? 'bg-[var(--color-cyan-400)]/15' : 'bg-gray-200 dark:bg-gray-700/60'}`}>
            <Upload className={`w-5 h-5 transition-colors duration-150 ${isDragging ? 'text-[var(--color-cyan-400)]' : 'text-gray-500 dark:text-gray-400'}`} />
          </div>
          <div className="text-center">
            <p className={`text-sm font-medium transition-colors duration-150 ${isDragging ? 'text-[var(--color-cyan-400)] [--gp-text-white:var(--color-cyan-400)]' : textPrimary}`}>
              {isDragging ? `Drop ${label.toLowerCase()} here` : `Upload ${label}`}
            </p>
            <p className={`text-xs mt-0.5 ${textSecondary} ${isDragging ? 'invisible' : ''}`}>Drag & drop or click to browse</p>
          </div>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border transition-colors duration-150 ${isDragging ? 'bg-[var(--color-cyan-400)]/15 text-[var(--color-cyan-400)] border-[var(--color-cyan-400)]/30' : 'bg-gray-200 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600/50'}`}>
            .jar
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jar"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
        </div>
      )}

      {/* Upload queue */}
      {uploadQueue.length > 0 && (
        <div className={`${contentBg} border ${borderColor} rounded-xl overflow-hidden`}>
          {uploadQueue.map((item) => (
            <div key={item.id} className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 ${borderColor}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                item.error ? 'bg-red-500/15' : item.done ? 'bg-emerald-500/15' : 'bg-gray-700/60'
              }`}>
                {item.error
                  ? <X className="w-4 h-4 text-red-400" />
                  : item.done
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-sm font-medium truncate ${textPrimary}`}>{item.name}</span>
                  <span className={`text-xs flex-shrink-0 font-medium ${
                    item.error ? 'text-red-400' : item.done ? 'text-emerald-400' : 'text-gray-400'
                  }`}>
                    {item.error ? 'Failed' : item.done ? 'Done' : `${item.progress}%`}
                  </span>
                </div>
                {!item.done && (
                  <div className="w-full bg-gray-700/60 rounded-full h-1">
                    <div
                      className="bg-[var(--color-cyan-400)] h-1 rounded-full transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                {item.error && <p className="text-xs text-red-400 mt-0.5">{item.error}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File list */}
      <div className={`${contentBg} border ${borderColor} rounded-xl overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${borderColor}`}>
          <div className="flex items-center gap-2">
            <h4 className={`text-sm font-semibold ${textPrimary}`}>Installed {label}</h4>
            {!loading && entries.length > 0 && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-700/60 text-gray-300 border border-gray-600/40">
                {entries.length}
              </span>
            )}
          </div>
          <AppButton
            tone="ghost"
            onClick={() => { loaded.current = false; void loadEntries(); }}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </AppButton>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading {kind}…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 px-4 py-4 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-700/50 flex items-center justify-center">
              <Package className="w-5 h-5 text-gray-500" />
            </div>
            <div className="text-center">
              <p className={`text-sm font-medium ${textPrimary}`}>No {kind} installed</p>
              <p className={`text-xs mt-0.5 ${textSecondary}`}>
                {canWrite ? `Upload a .jar file above to add your first ${singularLabel}` : `No ${kind} found`}
              </p>
            </div>
          </div>
        )}

        {/* File list */}
        {!loading && entries.length > 0 && (
          <div>
            {entries.map((entry) => (
              <div key={entry.name} className={`flex items-center gap-3 px-4 py-3 group border-b last:border-b-0 ${borderColor}`}>
                {/* Icon */}
                <div className="w-9 h-9 rounded-lg bg-gray-700/50 flex items-center justify-center flex-shrink-0">
                  <FileCode2 className="w-4 h-4 text-gray-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${textPrimary}`}>{entry.name}</p>
                  <p className={`text-xs ${textSecondary}`}>
                    {formatFileSize(entry.size)}
                    {entry.modifiedAt && (
                      <> · {new Date(entry.modifiedAt).toLocaleDateString()}</>
                    )}
                  </p>
                </div>

                {/* Delete action */}
                {canWrite && (
                  pendingDelete === entry.name ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-xs ${textSecondary}`}>Delete?</span>
                      <AppButton
                        tone="ghost"
                        onClick={() => setPendingDelete(null)}
                        className="px-2 py-1 text-xs rounded text-gray-400 hover:text-white hover:bg-gray-700/60 transition-colors"
                      >
                        Cancel
                      </AppButton>
                      <AppButton
                        tone="ghost"
                        onClick={async () => { setPendingDelete(null); await handleDelete(entry.name); }}
                        disabled={deleting.has(entry.name)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-50 transition-colors"
                      >
                        {deleting.has(entry.name) ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        Confirm
                      </AppButton>
                    </div>
                  ) : (
                    <AppButton
                      tone="ghost"
                      onClick={() => setPendingDelete(entry.name)}
                      disabled={deleting.has(entry.name)}
                      className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 disabled:opacity-50"
                      title={`Delete ${entry.name}`}
                    >
                      {deleting.has(entry.name)
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />
                      }
                    </AppButton>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
