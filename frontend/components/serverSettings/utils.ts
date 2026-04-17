import type { ReleaseConfigFileDefinition } from '../../utils/api';
import { isServerStoppedStatus } from '../../utils/serverRuntime';

export const normalizeConfigPath = (raw: string) => {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
  if (!cleaned) return '';
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
};

export const parseConfigPaths = (value: unknown): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return normalizeConfigPath(entry);
        if (entry && typeof entry === 'object') {
          const path = normalizeConfigPath(String((entry as ReleaseConfigFileDefinition).path || ''));
          return path;
        }
        return '';
      })
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[')) {
      try {
        return parseConfigPaths(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }

    const single = normalizeConfigPath(trimmed);
    return single ? [single] : [];
  }

  return [];
};

export const normalizePath = (raw: string) => {
  if (!raw || raw === '/') return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

export const joinPath = (base: string, name: string) => {
  const safeBase = normalizePath(base);
  if (safeBase === '/') return `/${name}`;
  return `${safeBase}/${name}`;
};

export const normalizeFilePath = (raw: string) => {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
  if (!cleaned) return '/';
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
};

export const splitFilePath = (fullPath: string) => {
  const normalized = normalizeFilePath(fullPath);
  const parts = normalized.split('/').filter(Boolean);
  const fileName = parts.pop() || '';
  const directory = parts.length > 0 ? `/${parts.join('/')}` : '/';
  return { normalized, directory, fileName };
};

export const isSymlinkEntry = (file: { type?: string } | null | undefined): boolean =>
  file?.type === 'symlink';

export const getApiErrorMessage = (error: any): string => {
  const responseData = error?.response?.data;
  if (typeof responseData === 'string' && responseData.trim()) return responseData;
  if (typeof responseData?.error === 'string' && responseData.error.trim()) return responseData.error;
  if (typeof responseData?.message === 'string' && responseData.message.trim())
    return responseData.message;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  return '';
};

export const isServerBusyForFileMutations = (status: string | undefined): boolean => {
  return !isServerStoppedStatus(status);
};

export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(1)} ${units[idx]}`;
};

export const formatTime = (hour: number, minute: number) => {
  const h = String(Math.max(0, Math.min(23, hour))).padStart(2, '0');
  const m = String(Math.max(0, Math.min(59, minute))).padStart(2, '0');
  return `${h}:${m}`;
};

export const parseTime = (time: string) => {
  const [h, m] = time.split(':').map((v) => Number.parseInt(v, 10));
  return {
    hour: Number.isFinite(h) ? h : 0,
    minute: Number.isFinite(m) ? m : 0,
  };
};

export const CRON_DAY_MAP: Record<string, string> = {
  sunday: '0',
  monday: '1',
  tuesday: '2',
  wednesday: '3',
  thursday: '4',
  friday: '5',
  saturday: '6',
};

export const CRON_DAY_REVERSE_MAP: Record<string, string> = {
  '0': 'sunday',
  '1': 'monday',
  '2': 'tuesday',
  '3': 'wednesday',
  '4': 'thursday',
  '5': 'friday',
  '6': 'saturday',
  '7': 'sunday',
  sun: 'sunday',
  mon: 'monday',
  tue: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  fri: 'friday',
  sat: 'saturday',
};

export const parseCronSchedule = (
  schedule: string,
  fallback: { hours: number; time: string; day: string }
) => {
  const parts = schedule.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length !== 5) return null;

  const [min, hour, dom, mon, dow] = parts;
  if (dom !== '*' || mon !== '*') return null;

  const hourStepMatch = /^(?:\*|0)\/(\d+)$/.exec(hour);
  if (min === '0' && dow === '*' && hourStepMatch) {
    const step = Number.parseInt(hourStepMatch[1], 10);
    if (Number.isFinite(step) && step > 0) {
      return { type: 'hourly' as const, hours: step, time: fallback.time, day: fallback.day };
    }
  }

  const hourNum = Number.parseInt(hour, 10);
  const minNum = Number.parseInt(min, 10);
  if (Number.isFinite(hourNum) && Number.isFinite(minNum)) {
    if (dow === '*') {
      return {
        type: 'daily' as const,
        hours: fallback.hours,
        time: formatTime(hourNum, minNum),
        day: fallback.day,
      };
    }

    const dayKey = CRON_DAY_REVERSE_MAP[dow.toLowerCase()];
    if (dayKey) {
      return {
        type: 'weekly' as const,
        hours: fallback.hours,
        time: formatTime(hourNum, minNum),
        day: dayKey,
      };
    }
  }

  return null;
};

export const buildCronSchedule = (options: {
  frequencyType: 'hourly' | 'daily' | 'weekly';
  hours: number;
  time: string;
  day: string;
}) => {
  if (options.frequencyType === 'hourly') {
    const hours = Math.max(1, Math.min(24, options.hours));
    return `0 */${hours} * * *`;
  }

  const { hour, minute } = parseTime(options.time || '00:00');
  const minuteValue = Math.max(0, Math.min(59, minute));
  const hourValue = Math.max(0, Math.min(23, hour));

  if (options.frequencyType === 'weekly') {
    const cronDay = CRON_DAY_MAP[options.day] ?? '0';
    return `${minuteValue} ${hourValue} * * ${cronDay}`;
  }

  return `${minuteValue} ${hourValue} * * *`;
};
