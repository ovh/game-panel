import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type FreqType = 'minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

interface CronState {
  freqType: FreqType;
  everyMinutes: number;
  everyHours: number;
  time: string;
  weekDays: number[]; // cron dow: 0=Sun 1=Mon … 6=Sat
  monthDay: number;
  customCron: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FREQ_TABS: { id: FreqType; label: string }[] = [
  { id: 'minutes', label: 'Minutes' },
  { id: 'hourly',  label: 'Hourly'  },
  { id: 'daily',   label: 'Daily'   },
  { id: 'weekly',  label: 'Weekly'  },
  { id: 'monthly', label: 'Monthly' },
  { id: 'custom',  label: 'Custom'  },
];

const MINUTE_OPTIONS = [1, 2, 5, 10, 15, 20, 30, 45];
const HOUR_OPTIONS   = [1, 2, 3, 4, 6, 8, 12];

// Display Mon→Sun; maps display index → cron DOW value
const DAY_MAP    = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT  = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_FULL   = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// cron DOW → display full name
const DOW_NAME: Record<number, string> = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
const DOW_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// ─── Timezone helpers ─────────────────────────────────────────────────────────
// The backend cron runner interprets cron expressions in the server's timezone
// (typically UTC). These helpers convert between local browser time and UTC so
// that users always see and enter times in their own timezone.

function localCronTimeToUtc(localTime: string): { h: number; m: number; dayOffset: number } {
  const [hStr = '0', mStr = '0'] = localTime.split(':');
  const h = parseInt(hStr) || 0;
  const m = parseInt(mStr) || 0;
  const offset = new Date().getTimezoneOffset(); // negative for UTC+X (e.g. -120 for UTC+2)
  const totalMin = h * 60 + m + offset;
  const normalizedMin = ((totalMin % 1440) + 1440) % 1440;
  return {
    h: Math.floor(normalizedMin / 60),
    m: normalizedMin % 60,
    dayOffset: totalMin < 0 ? -1 : totalMin >= 1440 ? 1 : 0,
  };
}

function utcCronTimeToLocal(utcH: number, utcM: number): { time: string; dayOffset: number } {
  const offset = new Date().getTimezoneOffset();
  const totalMin = utcH * 60 + utcM - offset;
  const normalizedMin = ((totalMin % 1440) + 1440) % 1440;
  const localH = Math.floor(normalizedMin / 60);
  const localM = normalizedMin % 60;
  return {
    time: `${String(localH).padStart(2, '0')}:${String(localM).padStart(2, '0')}`,
    dayOffset: totalMin < 0 ? -1 : totalMin >= 1440 ? 1 : 0,
  };
}

// ─── Parse cron → state ───────────────────────────────────────────────────────

function parseCron(cron: string): CronState {
  const base: CronState = {
    freqType: 'daily',
    everyMinutes: 15,
    everyHours: 6,
    time: '05:00',
    weekDays: [1],
    monthDay: 1,
    customCron: cron,
  };
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return { ...base, freqType: 'custom' };
  const [min, hour, dom, month, dow] = p;

  if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*')
    return { ...base, freqType: 'minutes', everyMinutes: parseInt(min.slice(2)) || 15 };

  if (hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*')
    return { ...base, freqType: 'hourly', everyHours: parseInt(hour.slice(2)) || 6 };

  if (!/[*/,\-]/.test(min) && !/[*/,\-]/.test(hour)) {
    const local = utcCronTimeToLocal(parseInt(hour) || 0, parseInt(min) || 0);
    const { time } = local;
    if (dom !== '*' && !/[*/,\-]/.test(dom) && month === '*' && dow === '*') {
      const localDom = Math.max(1, Math.min(28, (parseInt(dom) || 1) + local.dayOffset));
      return { ...base, freqType: 'monthly', time, monthDay: localDom };
    }
    if (dom === '*' && month === '*' && dow !== '*') {
      const days = dow.split(',').map(Number).filter((d) => !isNaN(d));
      const localDays = local.dayOffset
        ? [...new Set(days.map((d) => ((d + local.dayOffset) + 7) % 7))]
        : days;
      return { ...base, freqType: 'weekly', time, weekDays: localDays.length ? localDays : [1] };
    }
    if (dom === '*' && month === '*' && dow === '*')
      return { ...base, freqType: 'daily', time };
  }

  return { ...base, freqType: 'custom' };
}

// ─── State → cron ─────────────────────────────────────────────────────────────

function stateToCron(s: CronState): string {
  switch (s.freqType) {
    case 'minutes': return `*/${s.everyMinutes} * * * *`;
    case 'hourly':  return `0 */${s.everyHours} * * *`;
    case 'daily': {
      const utc = localCronTimeToUtc(s.time);
      return `${utc.m} ${utc.h} * * *`;
    }
    case 'weekly': {
      const utc = localCronTimeToUtc(s.time);
      const utcDays = [...new Set(
        s.weekDays.map((d) => utc.dayOffset ? ((d + utc.dayOffset) + 7) % 7 : d)
      )].sort((a, b) => DOW_DISPLAY_ORDER.indexOf(a) - DOW_DISPLAY_ORDER.indexOf(b));
      return `${utc.m} ${utc.h} * * ${utcDays.join(',')}`;
    }
    case 'monthly': {
      const utc = localCronTimeToUtc(s.time);
      const dom = Math.max(1, Math.min(28, s.monthDay + utc.dayOffset));
      return `${utc.m} ${utc.h} ${dom} * *`;
    }
    case 'custom':  return s.customCron;
  }
}

// ─── Description ──────────────────────────────────────────────────────────────

function describeState(s: CronState): string {
  switch (s.freqType) {
    case 'minutes': return `Every ${s.everyMinutes} minute${s.everyMinutes !== 1 ? 's' : ''}`;
    case 'hourly':  return `Every ${s.everyHours} hour${s.everyHours !== 1 ? 's' : ''}`;
    case 'daily':   return `Every day at ${s.time}`;
    case 'weekly': {
      const sorted = [...s.weekDays].sort((a, b) => DOW_DISPLAY_ORDER.indexOf(a) - DOW_DISPLAY_ORDER.indexOf(b));
      const names = sorted.map((d) => DOW_NAME[d] ?? `day ${d}`);
      if (names.length === 1) return `Every ${names[0]} at ${s.time}`;
      const last = names[names.length - 1];
      return `Every ${names.slice(0, -1).join(', ')} and ${last} at ${s.time}`;
    }
    case 'monthly': return `Every month on day ${s.monthDay} at ${s.time}`;
    case 'custom': {
      const p = s.customCron.trim().split(/\s+/);
      if (p.length !== 5) return s.customCron;
      const [min, hour, dom, , dow] = p;
      if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`;
      if (hour.startsWith('*/')) return `Every ${hour.slice(2)} hours`;
      if (!/[*/,\-]/.test(min) && !/[*/,\-]/.test(hour)) {
        const t = `${hour.padStart(2,'0')}:${min.padStart(2,'0')}`;
        if (dom !== '*') return `Every month on day ${dom} at ${t}`;
        if (dow !== '*') return `Every week at ${t}`;
        return `Every day at ${t}`;
      }
      return s.customCron;
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CronPickerProps {
  value: string;
  onChange: (cron: string) => void;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  inputBorder: string;
}

export function CronPicker({ value, onChange, borderColor, textPrimary, textSecondary, inputBorder }: CronPickerProps) {
  const [state, setState] = useState<CronState>(() => parseCron(value));

  const update = (patch: Partial<CronState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      onChange(stateToCron(next));
      return next;
    });
  };

  const switchTab = (id: FreqType) => {
    // Pre-fill custom input with current generated cron
    if (id === 'custom') {
      update({ freqType: 'custom', customCron: stateToCron(state) });
    } else {
      update({ freqType: id });
    }
  };

  const selectCls = `rounded-lg bg-white dark:bg-[#0f1723]/60 border ${inputBorder} ${textPrimary} text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--gp-ods-accent-primary)] transition-all`;
  const timeCls   = `rounded-lg bg-white dark:bg-[#0f1723]/60 border ${inputBorder} ${textPrimary} text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--gp-ods-accent-primary)] transition-all`;

  const description = describeState(state);

  return (
    <div className="space-y-2">
      {/* Frequency tabs */}
      <div className="flex flex-wrap gap-1.5">
        {FREQ_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTab(id)}
            style={state.freqType === id ? { color: 'white' } : undefined}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              state.freqType === id
                ? 'bg-[var(--gp-ods-accent-primary)] shadow-sm'
                : `${textSecondary} bg-gray-100 dark:bg-white/5 border ${borderColor} hover:bg-gray-200 dark:hover:bg-white/10`
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className={`p-4 rounded-lg border ${borderColor} bg-gray-50 dark:bg-gray-900/30 space-y-4`}>

        {state.freqType === 'minutes' && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-sm ${textPrimary}`}>Every</span>
            <select
              value={state.everyMinutes}
              onChange={(e) => update({ everyMinutes: parseInt(e.target.value) })}
              className={selectCls}
            >
              {MINUTE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} minute{n !== 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>
        )}

        {state.freqType === 'hourly' && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-sm ${textPrimary}`}>Every</span>
            <select
              value={state.everyHours}
              onChange={(e) => update({ everyHours: parseInt(e.target.value) })}
              className={selectCls}
            >
              {HOUR_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} hour{n !== 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>
        )}

        {state.freqType === 'daily' && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-sm ${textPrimary}`}>Every day at</span>
            <input
              type="time"
              value={state.time}
              onChange={(e) => update({ time: e.target.value })}
              className={timeCls}
            />
          </div>
        )}

        {state.freqType === 'weekly' && (
          <div className="space-y-3">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${textSecondary}`}>Days</p>
              <div className="flex gap-1.5">
                {DAY_MAP.map((cronDow, idx) => {
                  const selected = state.weekDays.includes(cronDow);
                  return (
                    <button
                      key={idx}
                      type="button"
                      title={DAY_FULL[idx]}
                      onClick={() => {
                        const next = selected
                          ? state.weekDays.filter((d) => d !== cronDow)
                          : [...state.weekDays, cronDow];
                        if (next.length > 0) update({ weekDays: next });
                      }}
                      style={selected ? { color: 'white' } : undefined}
                      className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${
                        selected
                          ? 'bg-[var(--gp-ods-accent-primary)] shadow-sm'
                          : `${textSecondary} bg-gray-100 dark:bg-white/10 border ${borderColor} hover:bg-gray-200 dark:hover:bg-white/20`
                      }`}
                    >
                      {DAY_SHORT[idx]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm ${textPrimary}`}>At</span>
              <input
                type="time"
                value={state.time}
                onChange={(e) => update({ time: e.target.value })}
                className={timeCls}
              />
            </div>
          </div>
        )}

        {state.freqType === 'monthly' && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-sm ${textPrimary}`}>Day</span>
            <select
              value={state.monthDay}
              onChange={(e) => update({ monthDay: parseInt(e.target.value) })}
              className={selectCls}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <span className={`text-sm ${textPrimary}`}>of each month at</span>
            <input
              type="time"
              value={state.time}
              onChange={(e) => update({ time: e.target.value })}
              className={timeCls}
            />
          </div>
        )}

        {state.freqType === 'custom' && (
          <div>
            <input
              type="text"
              value={state.customCron}
              onChange={(e) => update({ customCron: e.target.value })}
              placeholder="0 5 * * *"
              className={`w-full font-mono rounded-lg bg-white dark:bg-[#0f1723]/60 border ${inputBorder} ${textPrimary} text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--gp-ods-accent-primary)] transition-all`}
            />
            <p className={`mt-1 text-xs ${textSecondary}`}>Format: min hour day month weekday</p>
          </div>
        )}

        {/* Summary line — only shown in custom mode */}
        {state.freqType === 'custom' && (
          <div className={`pt-2 border-t ${borderColor} flex items-center gap-2 flex-wrap`}>
            <span className={`text-xs font-medium ${textPrimary}`}>↳ {description}</span>
          </div>
        )}
      </div>
    </div>
  );
}
