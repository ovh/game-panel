import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle, Clock, GripVertical, Loader2, Pencil, Plus,
  RefreshCw, Trash2, XCircle, X, Save, RotateCcw,
} from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppButton, AppToggle } from '../../src/ui/components';
import { apiClient } from '../../utils/api';
import { CronPicker } from './CronPicker';
import { ConfirmationModal } from '../ConfirmationModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrePostStep {
  type: 'game_command' | 'sleep';
  command?: string;
  seconds?: number;
}

interface ScheduledTask {
  id: number;
  type: 'restart' | 'backup' | 'custom';
  schedule: string;
  enabled: boolean;
  payload: {
    pre?: PrePostStep[];
    post?: PrePostStep[];
    includeServerArtifact?: boolean;
    command?: string;
    workdir?: string;
  };
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

interface TaskForm {
  type: 'restart' | 'backup' | 'custom';
  schedule: string;
  enabled: boolean;
  pre: PrePostStep[];
  post: PrePostStep[];
  includeServerArtifact: boolean;
  command: string;
  workdir: string;
}

const DEFAULT_FORM: TaskForm = {
  type: 'restart',
  schedule: '0 5 * * *',
  enabled: true,
  pre: [],
  post: [],
  includeServerArtifact: false,
  command: '',
  workdir: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function describeCron(expr: string, nextRunAt?: string | null): string {
  const p = expr.trim().split(/\s+/);
  if (p.length !== 5) return expr;
  const [min, hour, dom, month, dow] = p;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const n = parseInt(min.slice(2));
    return `Every ${n} minute${n !== 1 ? 's' : ''}`;
  }
  if (hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*') {
    const n = parseInt(hour.slice(2));
    return `Every ${n} hour${n !== 1 ? 's' : ''}`;
  }
  if (!/[*/,\-]/.test(min) && !/[*/,\-]/.test(hour) && dom === '*' && month === '*') {
    // Derive local time from nextRunAt so that UTC server times display correctly in the user's timezone.
    let time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    let dayLabel: string | null = dow !== '*' ? (DAYS[parseInt(dow)] ?? `day ${dow}`) : null;
    if (nextRunAt) {
      const d = new Date(nextRunAt);
      if (Number.isFinite(d.getTime())) {
        time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        if (dow !== '*') dayLabel = DAYS[d.getDay()] ?? `day ${dow}`;
      }
    }
    if (dayLabel === null) return `Every day at ${time}`;
    return `Every ${dayLabel} at ${time}`;
  }
  return expr;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = Date.now();
  const diff = d.getTime() - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  if (abs < 90000) return diff > 0 ? 'in <1 min' : '<1 min ago';
  if (abs < 5400000) return diff > 0 ? `in ${mins} min` : `${mins} min ago`;
  if (abs < 86400000 * 2) return diff > 0 ? `in ${hours} h` : `${hours} h ago`;
  return diff > 0 ? `in ${days} d` : `${days} d ago`;
}

function taskFormToPayload(form: TaskForm, showPrePost: boolean, showIncludeServerArtifact: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  if (showPrePost) {
    if (form.pre.length) base.pre = form.pre;
    if (form.post.length) base.post = form.post;
  }
  if (form.type === 'backup' && showIncludeServerArtifact) base.includeServerArtifact = form.includeServerArtifact;
  if (form.type === 'custom') {
    base.command = form.command.trim();
    if (form.workdir.trim()) base.workdir = form.workdir.trim();
  }
  return base;
}

function taskToForm(task: ScheduledTask): TaskForm {
  return {
    type: task.type,
    schedule: task.schedule,
    enabled: task.enabled,
    pre: (task.payload.pre ?? []) as PrePostStep[],
    post: (task.payload.post ?? []) as PrePostStep[],
    includeServerArtifact: task.payload.includeServerArtifact ?? false,
    command: task.payload.command ?? '',
    workdir: task.payload.workdir ?? '',
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">Never run</span>;
  const map: Record<string, { label: string; cls: string; icon: JSX.Element }> = {
    success: { label: 'Success', cls: 'text-green-500', icon: <CheckCircle className="w-3.5 h-3.5" /> },
    failed:  { label: 'Failed',  cls: 'text-red-500',   icon: <XCircle className="w-3.5 h-3.5" /> },
    skipped: { label: 'Skipped', cls: 'text-yellow-500', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    running: { label: 'Running', cls: 'text-blue-500',  icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  };
  const s = map[status] ?? { label: status, cls: 'text-gray-400', icon: <Clock className="w-3.5 h-3.5" /> };
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
}

function TypeBadge({ type }: { type: ScheduledTask['type'] }) {
  const map = {
    restart: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    backup:  'bg-green-500/10 text-green-500 border-green-500/30',
    custom:  'bg-purple-500/10 text-purple-400 border-purple-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${map[type]}`}>
      {type}
    </span>
  );
}

interface StepsEditorProps {
  label: string;
  steps: PrePostStep[];
  onChange: (steps: PrePostStep[]) => void;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
}

function SortableStep({
  id, step, index, onUpdate, onRemove, textPrimary, textSecondary, borderColor,
}: {
  id: number; step: PrePostStep; index: number;
  onUpdate: (i: number, next: PrePostStep) => void;
  onRemove: (i: number) => void;
  textPrimary: string; textSecondary: string; borderColor: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`flex gap-2 items-center mb-2 p-2 rounded-lg border ${borderColor} bg-gray-50 dark:bg-gray-900/30`}
    >
      <button type="button" {...attributes} {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-300 flex-shrink-0 touch-none"
        tabIndex={-1}>
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className={`text-xs font-mono w-20 flex-shrink-0 ${textSecondary}`}>
        {step.type === 'game_command' ? 'command' : 'sleep'}
      </span>
      {step.type === 'game_command' ? (
        <input
          type="text" placeholder="say Hello"
          value={step.command ?? ''}
          onChange={(e) => onUpdate(index, { ...step, command: e.target.value })}
          className={`flex-1 rounded bg-white dark:bg-[#0f1723]/60 border ${borderColor} ${textPrimary} text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)]`}
        />
      ) : (
        <input
          type="number" min="1" placeholder="30"
          value={step.seconds ?? ''}
          onChange={(e) => onUpdate(index, { ...step, seconds: parseInt(e.target.value) || 1 })}
          className={`w-24 rounded bg-white dark:bg-[#0f1723]/60 border ${borderColor} ${textPrimary} text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--gp-ods-accent-primary)]`}
        />
      )}
      {step.type === 'sleep' && (
        <span className={`text-xs ${textSecondary}`}>seconds</span>
      )}
      <AppButton type="button" tone="ghost" onClick={() => onRemove(index)}
        className="p-1 text-gray-400 hover:text-red-400 rounded flex-shrink-0">
        <X className="w-3 h-3" />
      </AppButton>
    </div>
  );
}

function StepsEditor({ label, steps, onChange, textPrimary, textSecondary, borderColor }: StepsEditorProps) {
  const idsRef = useRef<number[]>([]);
  const nextIdRef = useRef(0);

  // Keep IDs in sync with steps length
  while (idsRef.current.length < steps.length) idsRef.current.push(nextIdRef.current++);
  if (idsRef.current.length > steps.length) idsRef.current = idsRef.current.slice(0, steps.length);

  const addStep = (step: PrePostStep) => {
    idsRef.current = [...idsRef.current, nextIdRef.current++];
    onChange([...steps, step]);
  };
  const update = (i: number, next: PrePostStep) =>
    onChange(steps.map((s, idx) => (idx === i ? next : s)));
  const remove = (i: number) => {
    idsRef.current = idsRef.current.filter((_, idx) => idx !== i);
    onChange(steps.filter((_, idx) => idx !== i));
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = idsRef.current.indexOf(active.id as number);
    const newIndex = idsRef.current.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;
    idsRef.current = arrayMove([...idsRef.current], oldIndex, newIndex);
    onChange(arrayMove([...steps], oldIndex, newIndex));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>{label}</span>
        <div className="flex gap-1">
          <AppButton
            type="button" tone="ghost"
            onClick={() => addStep({ type: 'game_command', command: '' })}
            className="flex items-center gap-1 text-xs text-[var(--gp-ods-accent-primary)] hover:text-[var(--gp-ods-accent-secondary)] px-2 py-1 rounded"
          >
            <Plus className="w-3 h-3" /> Command
          </AppButton>
          <AppButton
            type="button" tone="ghost"
            onClick={() => addStep({ type: 'sleep', seconds: 30 })}
            className="flex items-center gap-1 text-xs text-[var(--gp-ods-accent-primary)] hover:text-[var(--gp-ods-accent-secondary)] px-2 py-1 rounded"
          >
            <Clock className="w-3 h-3" /> Sleep
          </AppButton>
        </div>
      </div>
      {steps.length === 0 && (
        <p className={`text-xs italic ${textSecondary}`}>No steps.</p>
      )}
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={idsRef.current} strategy={verticalListSortingStrategy}>
          {steps.map((step, i) => (
            <SortableStep
              key={idsRef.current[i]}
              id={idsRef.current[i]}
              step={step}
              index={i}
              onUpdate={update}
              onRemove={remove}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              borderColor={borderColor}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ScheduledTasksTabProps {
  serverId?: number | null;
  serverBackupSupported: boolean;
  serverProvider?: string;
  serverGame?: string;
  canRead: boolean;
  canWrite: boolean;
  contentBg: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  hoverBg: string;
  inputBg: string;
  inputBorder: string;
}

export function ScheduledTasksTab({
  serverId,
  serverBackupSupported,
  serverProvider,
  serverGame = '',
  canRead,
  canWrite,
  contentBg,
  borderColor,
  textPrimary,
  textSecondary,
  hoverBg,
  inputBg: _inputBg,
  inputBorder,
}: ScheduledTasksTabProps) {
  const isExternal = serverProvider === 'external';
  const showPrePost = !isExternal;
  const showIncludeServerArtifact =
    serverProvider === 'ovhcloud' &&
    serverBackupSupported &&
    serverGame.toLowerCase().includes('minecraft');

  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -1 = new task, >0 = edit task id, null = closed
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TaskForm>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string; message: string; onConfirm: () => Promise<void>;
  } | null>(null);

  const load = async () => {
    if (!serverId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getScheduledTasks(serverId);
      setTasks((res.tasks ?? []) as ScheduledTask[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load scheduled tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [serverId]);

  const openNew = () => {
    const defaultType = 'restart';
    setForm({ ...DEFAULT_FORM, type: defaultType });
    setFormError(null);
    setEditingId(-1);
  };

  const openEdit = (task: ScheduledTask) => {
    setForm(taskToForm(task));
    setFormError(null);
    setEditingId(task.id);
  };

  const closeForm = () => { setEditingId(null); setFormError(null); };

  const setF = <K extends keyof TaskForm>(k: K, v: TaskForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!serverId) return;
    if (!form.schedule.trim()) { setFormError('Schedule is required.'); return; }
    if (form.type === 'custom' && !form.command.trim()) { setFormError('Command is required.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = taskFormToPayload(form, showPrePost, showIncludeServerArtifact);
      if (editingId === -1) {
        await apiClient.createScheduledTask(serverId, {
          type: form.type,
          schedule: form.schedule.trim(),
          enabled: form.enabled,
          payload,
        });
      } else if (editingId !== null) {
        await apiClient.updateScheduledTask(serverId, editingId, {
          type: form.type,
          schedule: form.schedule.trim(),
          enabled: form.enabled,
          payload,
        });
      }
      closeForm();
      await load();
    } catch (err: any) {
      setFormError(err?.response?.data?.error || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (task: ScheduledTask) => {
    if (!serverId) return;
    setConfirmModal({
      title: 'Delete Task',
      message: `Delete this "${task.type}" scheduled task? This action cannot be undone.`,
      onConfirm: async () => {
        setDeletingId(task.id);
        try {
          await apiClient.deleteScheduledTask(serverId, task.id);
          await load();
        } catch (err: any) {
          setError(err?.response?.data?.error || 'Failed to delete task');
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const handleToggleEnabled = async (task: ScheduledTask) => {
    if (!serverId || !canWrite) return;
    try {
      await apiClient.updateScheduledTask(serverId, task.id, { enabled: !task.enabled });
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, enabled: !t.enabled } : t));
    } catch {
      // silent
    }
  };

  const inputCls = `w-full rounded-lg bg-white dark:bg-[#0f1723]/60 border ${inputBorder} ${textPrimary} text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--gp-ods-accent-primary)] focus:border-transparent transition-all`;

  const availableTypes: Array<{ value: TaskForm['type']; label: string }> = [
    { value: 'restart', label: 'Restart' },
    ...(serverBackupSupported ? [{ value: 'backup' as const, label: 'Backup' }] : []),
    { value: 'custom', label: 'Custom Command' },
  ];

  return (
    <>
    {confirmModal && (
      <ConfirmationModal
        isOpen={true}
        title={confirmModal.title}
        message={confirmModal.message}
        icon="danger"
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal(null)}
        confirmText="Delete"
        confirmButtonClass="bg-red-600 hover:bg-red-500"
      />
    )}
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className={`text-2xl font-bold ${textPrimary} mb-2`}>Scheduled Tasks</h3>
            <p className={`text-sm ${textSecondary}`}>
              Automate restarts, backups and custom commands on a cron schedule
            </p>
          </div>
          <div className="flex gap-2">
            <AppButton
              onClick={load}
              className="flex items-center gap-2 px-3 py-2 rounded text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
            >
              <RefreshCw className="w-4 h-4" />
            </AppButton>
            {canWrite && (
              <AppButton
                tone="primary"
                onClick={editingId === null ? openNew : closeForm}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              >
                {editingId !== null ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {editingId !== null ? 'Cancel' : 'Add Task'}
              </AppButton>
            )}
          </div>
        </div>

        {error && <div className="text-sm text-red-400">{error}</div>}

        {/* ── Form ── */}
        {editingId !== null && (
          <div className={`${contentBg} border ${borderColor} rounded-lg p-5 space-y-5`}>
            <h4 className={`text-base font-semibold ${textPrimary}`}>
              {editingId === -1 ? 'New Task' : 'Edit Task'}
            </h4>

            {/* Type */}
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${textSecondary}`}>
                Type
              </label>
              <div className="flex flex-wrap gap-2">
                {availableTypes.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setF('type', value); setF('command', ''); setF('workdir', ''); }}
                    style={form.type === value ? { color: 'white' } : undefined}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      form.type === value
                        ? 'bg-[var(--gp-ods-accent-primary)] shadow-md'
                        : `${textSecondary} bg-gray-100 dark:bg-white/5 border ${borderColor} hover:bg-gray-200 dark:hover:bg-white/10`
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${textSecondary}`}>
                Schedule
              </label>
              <CronPicker
                key={editingId ?? undefined}
                value={form.schedule}
                onChange={(v) => setF('schedule', v)}
                borderColor={borderColor}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                inputBorder={inputBorder}
              />
            </div>

            {/* Enabled */}
            <div className={`flex items-center justify-between p-3 rounded-lg border ${borderColor} bg-gray-50 dark:bg-gray-900/30`}>
              <p className={`text-sm font-medium ${textPrimary}`}>Enabled</p>
              <AppToggle
                ariaLabel="Task enabled"
                checked={form.enabled}
                size="standard"
                onChange={(v) => setF('enabled', v)}
              />
            </div>

            {/* Backup: includeServerArtifact */}
            {form.type === 'backup' && showIncludeServerArtifact && (
              <div className={`flex items-center justify-between p-3 rounded-lg border ${borderColor} bg-gray-50 dark:bg-gray-900/30`}>
                <div>
                  <p className={`text-sm font-medium ${textPrimary}`}>Include server artifact</p>
                  <p className={`text-xs ${textSecondary}`}>Back up the downloadable Minecraft server file</p>
                </div>
                <AppToggle
                  ariaLabel="Include server artifact"
                  checked={form.includeServerArtifact}
                  size="standard"
                  onChange={(v) => setF('includeServerArtifact', v)}
                />
              </div>
            )}

            {/* Custom: command + workdir */}
            {form.type === 'custom' && (
              <div className="space-y-4">
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${textSecondary}`}>
                    Command <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.command}
                    onChange={(e) => setF('command', e.target.value)}
                    placeholder="echo hello && ./my-script.sh"
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${textSecondary}`}>
                    Working directory <span className={`normal-case font-normal ${textSecondary}`}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.workdir}
                    onChange={(e) => setF('workdir', e.target.value)}
                    placeholder="/data"
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>
            )}

            {/* Pre / Post steps */}
            {showPrePost && (
              <div className="space-y-5">
                <StepsEditor
                  label="Pre-commands"
                  steps={form.pre}
                  onChange={(v) => setF('pre', v)}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  borderColor={borderColor}
                />
                <StepsEditor
                  label="Post-commands"
                  steps={form.post}
                  onChange={(v) => setF('post', v)}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  borderColor={borderColor}
                />
              </div>
            )}

            {formError && (
              <div className="text-sm text-red-400 flex items-center gap-2">
                <XCircle className="w-4 h-4 flex-shrink-0" /> {formError}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <AppButton tone="ghost" onClick={closeForm}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${textSecondary} border ${borderColor} hover:bg-gray-100 dark:hover:bg-white/10`}>
                Cancel
              </AppButton>
              <AppButton
                tone="primary"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save task'}
              </AppButton>
            </div>
          </div>
        )}

        {/* ── Task list ── */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--gp-ods-accent-primary)]" />
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <div className={`${contentBg} border ${borderColor} rounded-lg p-8 flex flex-col items-center gap-3`}>
            <Clock className="w-8 h-8 text-gray-400" />
            <p className={`text-sm ${textSecondary}`}>No scheduled tasks yet.</p>
            {canWrite && editingId === null && (
              <AppButton
                tone="primary"
                onClick={openNew}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Add your first task
              </AppButton>
            )}
          </div>
        )}

        {!loading && tasks.length > 0 && (
          <div className="space-y-3">
            {tasks.map((task) => {
              const desc = describeCron(task.schedule, task.nextRunAt);
              return (
                <div
                  key={task.id}
                  className={`${contentBg} border ${borderColor} rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between transition-colors ${hoverBg}`}
                >
                  {/* Left: type + schedule + status */}
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TypeBadge type={task.type} />
                      <span className={`text-xs ${textSecondary}`}>{desc}</span>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <StatusBadge status={task.lastStatus} />
                      {task.nextRunAt && (
                        <span className={`text-xs ${textSecondary}`}>
                          Next: {formatRelative(task.nextRunAt)}
                        </span>
                      )}
                      {task.lastRunAt && (
                        <span className={`text-xs ${textSecondary}`}>
                          Last: {formatRelative(task.lastRunAt)}
                        </span>
                      )}
                    </div>
                    {task.lastStatus === 'failed' && task.lastError && (
                      <p className="text-xs text-red-400 truncate">{task.lastError}</p>
                    )}
                  </div>

                  {/* Right: toggle + actions */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <AppToggle
                      ariaLabel="Task enabled"
                      checked={task.enabled}
                      size="standard"
                      onChange={() => handleToggleEnabled(task)}
                    />
                    {canWrite && (
                      <>
                        <AppButton
                          tone="ghost"
                          onClick={() => editingId === task.id ? closeForm() : openEdit(task)}
                          className={`p-2 rounded ${textSecondary} hover:text-[var(--gp-ods-accent-primary)] hover:bg-gray-100 dark:hover:bg-white/10`}
                        >
                          {editingId === task.id ? <RotateCcw className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                        </AppButton>
                        <AppButton
                          tone="ghost"
                          onClick={() => handleDelete(task)}
                          disabled={deletingId === task.id}
                          className="p-2 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                        >
                          {deletingId === task.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </AppButton>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
