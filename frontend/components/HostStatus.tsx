import {
  startTransition,
  useDeferredValue,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { apiClient } from '../utils/api';
import { HostStatusView } from './hostStatus/HostStatusView';
import { ODS_CHART_THEME } from './charts/theme';

interface SystemMetrics {
  cpu: number;
  memory: number;
  cpuUsage?: number;
  memoryUsage?: number;
  disk?: number;
  diskUsage?: number;
  disk_usage?: number;
  network_in: number;
  network_out: number;
  network?: { in?: number; out?: number };
  timestamp?: number | string;
}

type UsagePoint = { time: string; timestamp: number; value: number };
type UsageChartPoint = { time: string; timestamp: number; value: number | null };
type NetworkPoint = { time: string; timestamp: number; in: number; out: number };
type NetworkChartPoint = { time: string; timestamp: number; in: number | null; out: number | null };

const chartTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timelineTickSameDayFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timelineTickFullFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function HostStatus() {
  const [cpuUsage, setCpuUsage] = useState(0);
  const [ramUsage, setRamUsage] = useState(0);
  const [diskUsage, setDiskUsage] = useState(0);
  const [networkIn, setNetworkIn] = useState(0);
  const [networkOut, setNetworkOut] = useState(0);
  const [cpuHistory, setCpuHistory] = useState<UsagePoint[]>([]);
  const [ramHistory, setRamHistory] = useState<UsagePoint[]>([]);
  const [diskHistory, setDiskHistory] = useState<UsagePoint[]>([]);
  const [networkHistory, setNetworkHistory] = useState<NetworkPoint[]>([]);
  const [sharedZoom, setSharedZoom] = useState(100);
  const [sharedOffset, setSharedOffset] = useState(0);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const cpuHistoryRef = useRef<UsagePoint[]>([]);
  const ramHistoryRef = useRef<UsagePoint[]>([]);
  const diskHistoryRef = useRef<UsagePoint[]>([]);
  const networkHistoryRef = useRef<NetworkPoint[]>([]);
  const persistHistoriesTimerRef = useRef<number | null>(null);
  const pendingPersistedHistoriesRef = useRef<{
    cpu: UsagePoint[];
    ram: UsagePoint[];
    disk: UsagePoint[];
    network: NetworkPoint[];
  } | null>(null);

  const cpuHistoryKey = 'system_history_cpu';
  const ramHistoryKey = 'system_history_ram';
  const diskHistoryKey = 'system_history_disk';
  const networkHistoryKey = 'system_history_network';
  const rawHistoryKey = 'system_history_raw';
  const historyRequestLimit = 2000;
  const metricsGapThresholdMs = 60 * 60 * 1000;
  const maxTimelineDurationMs = 24 * 60 * 60 * 1000;
  const persistDebounceMs = 800;

  const bytesPerSecondToKilobytes = (bytesPerSec: number): number => {
    return bytesPerSec / 1024;
  };

  const formatSpeed = (kilobytesPerSecond: number): { value: number; unit: string } => {
    if (kilobytesPerSecond >= 1024 * 1024) {
      return {
        value: Math.round((kilobytesPerSecond / (1024 * 1024)) * 100) / 100,
        unit: 'GB/s',
      };
    } else if (kilobytesPerSecond >= 1024) {
      return { value: Math.round((kilobytesPerSecond / 1024) * 100) / 100, unit: 'MB/s' };
    } else {
      return { value: Math.round(kilobytesPerSecond * 100) / 100, unit: 'KB/s' };
    }
  };

  const formatNetworkTick = (value: number): string => {
    if (value >= 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(0)}G`;
    } else if (value >= 1024) {
      return `${(value / 1024).toFixed(0)}M`;
    } else {
      return `${value.toFixed(0)}K`;
    }
  };

  const calculateYDomain = (data: Array<{ value: number | null }>) => {
    if (!data || data.length === 0) return [0, 100];

    const values = data
      .map((d) => d.value)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length === 0) return [0, 100];

    const min = Math.min(...values);
    const max = Math.max(...values);

    const range = max - min || 10;
    const margin = Math.max(range * 0.15, 5);

    const yMin = Math.max(0, Math.floor(min - margin));
    let yMax = Math.ceil(max + margin);

    yMax = Math.ceil(yMax / 10) * 10;

    yMax = Math.min(100, yMax);

    return [yMin, yMax];
  };

  const calculateNetworkYDomain = (data: Array<{ in: number | null; out: number | null }>) => {
    if (!data || data.length === 0) return [0, 1024];

    const allValues = data
      .flatMap((d) => [d.in, d.out])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (allValues.length === 0) return [0, 1024];

    const max = Math.max(...allValues);

    const yMax = Math.ceil(max * 1.2);

    return [0, yMax];
  };

  const formatPercentTick = (value: number): string => {
    return `${Math.round(value)}%`;
  };

  const toEpochMs = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 1e12) return value; // Milliseconds epoch.
      if (value > 1e9) return value * 1000; // Seconds epoch.
      return null;
    }

    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }

    return null;
  };

  const getMetricEpochMs = (metric: any): number => {
    const rawTime =
      metric?.timestamp ??
      metric?.date ??
      metric?.datetime ??
      metric?.recorded_at ??
      metric?.created_at;

    const parsed = toEpochMs(rawTime);
    return parsed ?? Date.now();
  };

  const estimateStepMs = <T extends { timestamp: number }>(data: T[]): number => {
    if (data.length < 2) return 60 * 1000;

    const sampleStartIndex = Math.max(1, data.length - 120);
    let totalDelta = 0;
    let deltaCount = 0;

    for (let i = sampleStartIndex; i < data.length; i += 1) {
      const delta = data[i].timestamp - data[i - 1].timestamp;
      if (delta > 0 && delta < metricsGapThresholdMs * 2) {
        totalDelta += delta;
        deltaCount += 1;
      }
    }

    if (deltaCount === 0) return 60 * 1000;
    return totalDelta / deltaCount;
  };

  const getZoomedData = <T extends { timestamp: number }>(
    data: T[],
    zoomLevel: number,
    offset: number
  ): T[] => {
    if (!data || data.length === 0) return data;

    const earliestTimestamp = data[0].timestamp;
    const latestTimestamp = data[data.length - 1].timestamp;
    const timelineEndMs = Math.max(Date.now(), latestTimestamp);
    const visibleWindowMs = Math.max(
      15 * 60 * 1000,
      Math.round(maxTimelineDurationMs * (zoomLevel / 100))
    );
    const averageStepMs = estimateStepMs(data);
    const requestedOffsetMs = Math.max(0, offset) * averageStepMs;

    const availableRangeMs = Math.max(0, timelineEndMs - earliestTimestamp);
    const maxOffsetMs = Math.max(0, availableRangeMs - visibleWindowMs);
    const safeOffsetMs = Math.min(requestedOffsetMs, maxOffsetMs);

    const endTimestamp = timelineEndMs - safeOffsetMs;
    const startTimestamp = Math.max(earliestTimestamp, endTimestamp - visibleWindowMs);
    const zoomed = data.filter(
      (point) => point.timestamp >= startTimestamp && point.timestamp <= endTimestamp
    );

    if (zoomed.length > 1) return zoomed;

    const fallbackItemsToShow = Math.max(2, Math.ceil((data.length * zoomLevel) / 100));
    return data.slice(Math.max(0, data.length - fallbackItemsToShow));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // Keep drag interactions smooth inside charts.
    setIsDragging(true);
    setDragStart(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const delta = e.clientX - dragStart;
    const dragSensitivityPx = 2;
    const offsetDelta = Math.floor(delta / dragSensitivityPx);

    if (Math.abs(offsetDelta) < 1) return;

    setDragStart(e.clientX);

    setSharedOffset((prev) => Math.max(0, prev + offsetDelta));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleChartWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const zoomDelta = event.deltaY > 0 ? 10 : -10;
    setSharedZoom((currentZoom) => Math.max(10, Math.min(100, currentZoom + zoomDelta)));
  };

  const formatTime = (timestamp: any): string => {
    try {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return chartTimeFormatter.format(date);
      }
      return 'N/A';
    } catch {
      return 'N/A';
    }
  };

  const formatTimelineTick = (timestamp: number): string => {
    if (!Number.isFinite(timestamp)) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();

    return sameDay
      ? timelineTickSameDayFormatter.format(date)
      : timelineTickFullFormatter.format(date);
  };

  const formatTooltipTime = (label: unknown): string => {
    if (typeof label === 'number' && Number.isFinite(label)) return formatTime(label);
    const numeric = Number(label);
    if (Number.isFinite(numeric)) return formatTime(numeric);
    return 'N/A';
  };

  const addUsageGaps = useCallback(
    (data: UsagePoint[]): UsageChartPoint[] => {
      if (!data || data.length === 0) return [];

      const next: UsageChartPoint[] = [];
      for (let i = 0; i < data.length; i += 1) {
        const current = data[i];
        next.push({ ...current });

        const upcoming = data[i + 1];
        if (!upcoming) continue;

        if (upcoming.timestamp - current.timestamp > metricsGapThresholdMs) {
          next.push({
            time: formatTime(current.timestamp + 1),
            timestamp: current.timestamp + 1,
            value: null,
          });
        }
      }

      return next;
    },
    [metricsGapThresholdMs]
  );

  const addNetworkGaps = useCallback(
    (data: NetworkPoint[]): NetworkChartPoint[] => {
      if (!data || data.length === 0) return [];

      const next: NetworkChartPoint[] = [];
      for (let i = 0; i < data.length; i += 1) {
        const current = data[i];
        next.push({ ...current });

        const upcoming = data[i + 1];
        if (!upcoming) continue;

        if (upcoming.timestamp - current.timestamp > metricsGapThresholdMs) {
          next.push({
            time: formatTime(current.timestamp + 1),
            timestamp: current.timestamp + 1,
            in: null,
            out: null,
          });
        }
      }

      return next;
    },
    [metricsGapThresholdMs]
  );

  const dedupeByTimestamp = <T extends { timestamp: number }>(points: T[]): T[] => {
    if (points.length <= 1) return points;
    const next: T[] = [];
    for (const point of points) {
      const last = next[next.length - 1];
      if (last && Math.abs(last.timestamp - point.timestamp) < 1000) {
        next[next.length - 1] = point;
      } else {
        next.push(point);
      }
    }
    return next;
  };

  const clampHistoryWindow = <T extends { timestamp: number }>(
    points: T[],
    referenceMs: number
  ): T[] => {
    const minTimestamp = referenceMs - maxTimelineDurationMs;
    const maxTimestamp = referenceMs + 60_000;
    return points.filter(
      (point) => point.timestamp >= minTimestamp && point.timestamp <= maxTimestamp
    );
  };

  const normalizeUsageHistory = (points: UsagePoint[], referenceMs: number): UsagePoint[] => {
    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    return clampHistoryWindow(dedupeByTimestamp(sorted), referenceMs);
  };

  const normalizeNetworkHistory = (points: NetworkPoint[], referenceMs: number): NetworkPoint[] => {
    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    return clampHistoryWindow(dedupeByTimestamp(sorted), referenceMs);
  };

  const appendUsageHistory = (previous: UsagePoint[], nextPoint: UsagePoint, referenceMs: number) => {
    const last = previous[previous.length - 1];
    if (!last) return clampHistoryWindow([nextPoint], referenceMs);

    if (nextPoint.timestamp < last.timestamp - 1000) {
      return normalizeUsageHistory([...previous, nextPoint], referenceMs);
    }

    if (Math.abs(last.timestamp - nextPoint.timestamp) < 1000) {
      if (last.value === nextPoint.value && last.time === nextPoint.time) {
        return previous;
      }

      return clampHistoryWindow([...previous.slice(0, -1), nextPoint], referenceMs);
    }

    return clampHistoryWindow([...previous, nextPoint], referenceMs);
  };

  const appendNetworkHistory = (
    previous: NetworkPoint[],
    nextPoint: NetworkPoint,
    referenceMs: number
  ) => {
    const last = previous[previous.length - 1];
    if (!last) return clampHistoryWindow([nextPoint], referenceMs);

    if (nextPoint.timestamp < last.timestamp - 1000) {
      return normalizeNetworkHistory([...previous, nextPoint], referenceMs);
    }

    if (Math.abs(last.timestamp - nextPoint.timestamp) < 1000) {
      if (last.in === nextPoint.in && last.out === nextPoint.out && last.time === nextPoint.time) {
        return previous;
      }

      return clampHistoryWindow([...previous.slice(0, -1), nextPoint], referenceMs);
    }

    return clampHistoryWindow([...previous, nextPoint], referenceMs);
  };

  const schedulePersistHistories = (
    nextCpuHistory: UsagePoint[],
    nextRamHistory: UsagePoint[],
    nextDiskHistory: UsagePoint[],
    nextNetworkHistory: NetworkPoint[]
  ) => {
    pendingPersistedHistoriesRef.current = {
      cpu: nextCpuHistory,
      ram: nextRamHistory,
      disk: nextDiskHistory,
      network: nextNetworkHistory,
    };

    if (persistHistoriesTimerRef.current !== null) return;

    persistHistoriesTimerRef.current = window.setTimeout(() => {
      persistHistoriesTimerRef.current = null;

      const pending = pendingPersistedHistoriesRef.current;
      if (!pending) return;

      pendingPersistedHistoriesRef.current = null;

      try {
        localStorage.setItem(cpuHistoryKey, JSON.stringify(pending.cpu));
        localStorage.setItem(ramHistoryKey, JSON.stringify(pending.ram));
        localStorage.setItem(diskHistoryKey, JSON.stringify(pending.disk));
        localStorage.setItem(networkHistoryKey, JSON.stringify(pending.network));
      } catch {}
    }, persistDebounceMs);
  };

  useEffect(() => {
    cpuHistoryRef.current = cpuHistory;
  }, [cpuHistory]);

  useEffect(() => {
    ramHistoryRef.current = ramHistory;
  }, [ramHistory]);

  useEffect(() => {
    diskHistoryRef.current = diskHistory;
  }, [diskHistory]);

  useEffect(() => {
    networkHistoryRef.current = networkHistory;
  }, [networkHistory]);

  useEffect(() => {
    return () => {
      if (persistHistoriesTimerRef.current !== null) {
        window.clearTimeout(persistHistoriesTimerRef.current);
        persistHistoriesTimerRef.current = null;
      }

      const pending = pendingPersistedHistoriesRef.current;
      if (!pending) return;

      try {
        localStorage.setItem(cpuHistoryKey, JSON.stringify(pending.cpu));
        localStorage.setItem(ramHistoryKey, JSON.stringify(pending.ram));
        localStorage.setItem(diskHistoryKey, JSON.stringify(pending.disk));
        localStorage.setItem(networkHistoryKey, JSON.stringify(pending.network));
      } catch {}
    };
  }, []);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('system_metrics_latest');
      if (cached) {
        const metrics = JSON.parse(cached);
        const cpu = metrics.cpu ?? metrics.cpu_usage ?? metrics.cpuUsage ?? 0;
        const memory = metrics.memory ?? metrics.memory_usage ?? metrics.memoryUsage ?? 0;
        const disk = metrics.disk ?? metrics.disk_usage ?? metrics.diskUsage ?? 0;

        const cpuValue = cpu > 100 ? cpu / 100 : cpu;
        const memoryValue = memory > 100 ? memory / 100 : memory;
        const diskValue = disk > 100 ? disk / 100 : disk;

        setCpuUsage(Math.round(Math.min(cpuValue, 100) * 100) / 100);
        setRamUsage(Math.round(Math.min(memoryValue, 100) * 100) / 100);
        setDiskUsage(Math.round(Math.min(diskValue, 100) * 100) / 100);

        const netInBytes = metrics.network?.in || metrics.network_in || 0;
        const netOutBytes = metrics.network?.out || metrics.network_out || 0;
        setNetworkIn(bytesPerSecondToKilobytes(netInBytes));
        setNetworkOut(bytesPerSecondToKilobytes(netOutBytes));
      }
    } catch {}

    try {
      const cachedCpu = localStorage.getItem(cpuHistoryKey);
      const cachedRam = localStorage.getItem(ramHistoryKey);
      const cachedDisk = localStorage.getItem(diskHistoryKey);
      const cachedNetwork = localStorage.getItem(networkHistoryKey);
      const cachedRaw = localStorage.getItem(rawHistoryKey);
      const nowMs = Date.now();

      if (cachedCpu) {
        const parsed = JSON.parse(cachedCpu);
        if (Array.isArray(parsed)) setCpuHistory(normalizeUsageHistory(parsed, nowMs));
      }
      if (cachedRam) {
        const parsed = JSON.parse(cachedRam);
        if (Array.isArray(parsed)) setRamHistory(normalizeUsageHistory(parsed, nowMs));
      }
      if (cachedDisk) {
        const parsed = JSON.parse(cachedDisk);
        if (Array.isArray(parsed)) setDiskHistory(normalizeUsageHistory(parsed, nowMs));
      }
      if (cachedNetwork) {
        const parsed = JSON.parse(cachedNetwork);
        if (Array.isArray(parsed)) setNetworkHistory(normalizeNetworkHistory(parsed, nowMs));
      }

      if (!cachedCpu && !cachedRam && !cachedDisk && !cachedNetwork && cachedRaw) {
        const raw = JSON.parse(cachedRaw);
        if (Array.isArray(raw) && raw.length > 0) {
          const sorted = [...raw].sort(
            (a: any, b: any) => getMetricEpochMs(a) - getMetricEpochMs(b)
          );

          const nextCpu = sorted.map((m: any) => ({
            time: formatTime(getMetricEpochMs(m)),
            timestamp: getMetricEpochMs(m),
            value: Math.round((m.cpu_usage || m.cpu || 0) * 100) / 100,
          }));

          const nextRam = sorted.map((m: any) => ({
            time: formatTime(getMetricEpochMs(m)),
            timestamp: getMetricEpochMs(m),
            value: Math.round((m.memory_usage || m.memory || 0) * 100) / 100,
          }));

          const nextDisk = sorted.map((m: any) => {
            const disk = m.disk_usage ?? m.disk ?? m.diskUsage ?? 0;
            const diskValue = disk > 100 ? disk / 100 : disk;
            return {
              time: formatTime(getMetricEpochMs(m)),
              timestamp: getMetricEpochMs(m),
              value: Math.round(Math.min(diskValue, 100) * 100) / 100,
            };
          });

          const nextNet = sorted.map((m: any) => ({
            time: formatTime(getMetricEpochMs(m)),
            timestamp: getMetricEpochMs(m),
            in: bytesPerSecondToKilobytes(m.network_in || 0),
            out: bytesPerSecondToKilobytes(m.network_out || 0),
          }));

          const referenceMs = getMetricEpochMs(sorted[sorted.length - 1]);
          setCpuHistory(normalizeUsageHistory(nextCpu, referenceMs));
          setRamHistory(normalizeUsageHistory(nextRam, referenceMs));
          setDiskHistory(normalizeUsageHistory(nextDisk, referenceMs));
          setNetworkHistory(normalizeNetworkHistory(nextNet, referenceMs));
        }
      }
    } catch {}
  }, []);

  const handleSystemMetrics = useCallback((metrics: SystemMetrics) => {
    const cpu = metrics.cpu ?? (metrics as any).cpu_usage ?? metrics.cpuUsage ?? 0;
    const memory = metrics.memory ?? (metrics as any).memory_usage ?? metrics.memoryUsage ?? 0;
    const disk = metrics.disk ?? (metrics as any).disk_usage ?? metrics.diskUsage ?? 0;

    const cpuValue = cpu > 100 ? cpu / 100 : cpu;
    const memoryValue = memory > 100 ? memory / 100 : memory;
    const diskValue = disk > 100 ? disk / 100 : disk;
    const diskPercent = Math.round(Math.min(diskValue, 100) * 100) / 100;

    setCpuUsage(Math.round(Math.min(cpuValue, 100) * 100) / 100);
    setRamUsage(Math.round(Math.min(memoryValue, 100) * 100) / 100);
    setDiskUsage(diskPercent);

    const networkIn = metrics.network_in ?? (metrics as any).network?.in ?? 0;
    const networkOut = metrics.network_out ?? (metrics as any).network?.out ?? 0;

    const newNetworkIn = bytesPerSecondToKilobytes(networkIn);
    const newNetworkOut = bytesPerSecondToKilobytes(networkOut);

    setNetworkIn(newNetworkIn);
    setNetworkOut(newNetworkOut);

    const metricEpochMs = getMetricEpochMs(metrics);
    const now = new Date(metricEpochMs);
    const timeStr = chartTimeFormatter.format(now);

    const nextCpuHistory = appendUsageHistory(
      cpuHistoryRef.current,
      { time: timeStr, timestamp: metricEpochMs, value: cpu },
      metricEpochMs
    );
    const nextRamHistory = appendUsageHistory(
      ramHistoryRef.current,
      { time: timeStr, timestamp: metricEpochMs, value: memory },
      metricEpochMs
    );
    const nextDiskHistory = appendUsageHistory(
      diskHistoryRef.current,
      { time: timeStr, timestamp: metricEpochMs, value: diskPercent },
      metricEpochMs
    );
    const nextNetworkHistory = appendNetworkHistory(
      networkHistoryRef.current,
      { time: timeStr, timestamp: metricEpochMs, in: newNetworkIn, out: newNetworkOut },
      metricEpochMs
    );

    startTransition(() => {
      if (nextCpuHistory !== cpuHistoryRef.current) {
        cpuHistoryRef.current = nextCpuHistory;
        setCpuHistory(nextCpuHistory);
      }
      if (nextRamHistory !== ramHistoryRef.current) {
        ramHistoryRef.current = nextRamHistory;
        setRamHistory(nextRamHistory);
      }
      if (nextDiskHistory !== diskHistoryRef.current) {
        diskHistoryRef.current = nextDiskHistory;
        setDiskHistory(nextDiskHistory);
      }
      if (nextNetworkHistory !== networkHistoryRef.current) {
        networkHistoryRef.current = nextNetworkHistory;
        setNetworkHistory(nextNetworkHistory);
      }
    });

    schedulePersistHistories(
      nextCpuHistory,
      nextRamHistory,
      nextDiskHistory,
      nextNetworkHistory
    );
  }, []);

  useEffect(() => {
    apiClient.subscribeSystemMetrics(historyRequestLimit);

    const handleMetricsEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (!customEvent.detail) return;

      if (customEvent.detail.type === 'system-metrics') {
        handleSystemMetrics(customEvent.detail.metrics);
      }

      if (customEvent.detail.type === 'system-metrics-history') {
        const history = customEvent.detail.metrics || [];
        if (history.length > 0) {
          const sortedHistory = [...history].sort(
            (a: any, b: any) => getMetricEpochMs(a) - getMetricEpochMs(b)
          );
          const latest = sortedHistory[sortedHistory.length - 1];

          const nextCpu = sortedHistory.map((m: any) => ({
            time: formatTime(getMetricEpochMs(m)),
            timestamp: getMetricEpochMs(m),
            value: Math.round((m.cpu_usage || m.cpu || 0) * 100) / 100,
          }));

          const nextRam = sortedHistory.map((m: any) => ({
            time: formatTime(getMetricEpochMs(m)),
            timestamp: getMetricEpochMs(m),
            value: Math.round((m.memory_usage || m.memory || 0) * 100) / 100,
          }));

          const nextDisk = sortedHistory.map((m: any) => {
            const disk = m.disk_usage ?? m.disk ?? m.diskUsage ?? 0;
            const diskValue = disk > 100 ? disk / 100 : disk;
            return {
              time: formatTime(getMetricEpochMs(m)),
              timestamp: getMetricEpochMs(m),
              value: Math.round(Math.min(diskValue, 100) * 100) / 100,
            };
          });

          const nextNet = sortedHistory.map((m: any) => ({
            time: formatTime(getMetricEpochMs(m)),
            timestamp: getMetricEpochMs(m),
            in: bytesPerSecondToKilobytes(m.network_in || 0),
            out: bytesPerSecondToKilobytes(m.network_out || 0),
          }));

          const referenceMs = getMetricEpochMs(latest);
          const normalizedCpu = normalizeUsageHistory(nextCpu, referenceMs);
          const normalizedRam = normalizeUsageHistory(nextRam, referenceMs);
          const normalizedDisk = normalizeUsageHistory(nextDisk, referenceMs);
          const normalizedNet = normalizeNetworkHistory(nextNet, referenceMs);

          startTransition(() => {
            cpuHistoryRef.current = normalizedCpu;
            ramHistoryRef.current = normalizedRam;
            diskHistoryRef.current = normalizedDisk;
            networkHistoryRef.current = normalizedNet;
            setCpuHistory(normalizedCpu);
            setRamHistory(normalizedRam);
            setDiskHistory(normalizedDisk);
            setNetworkHistory(normalizedNet);
          });

          if (latest) {
            const cpu = latest.cpu_usage || latest.cpu || 0;
            const memory = latest.memory_usage || latest.memory || 0;
            const disk = latest.disk_usage ?? latest.disk ?? latest.diskUsage ?? 0;

            const cpuValue = cpu > 100 ? cpu / 100 : cpu;
            const memoryValue = memory > 100 ? memory / 100 : memory;
            const diskValue = disk > 100 ? disk / 100 : disk;

            setCpuUsage(Math.round(Math.min(cpuValue, 100) * 100) / 100);
            setRamUsage(Math.round(Math.min(memoryValue, 100) * 100) / 100);
            setDiskUsage(Math.round(Math.min(diskValue, 100) * 100) / 100);
            setNetworkIn(bytesPerSecondToKilobytes(latest.network_in || 0));
            setNetworkOut(bytesPerSecondToKilobytes(latest.network_out || 0));
          }

          schedulePersistHistories(normalizedCpu, normalizedRam, normalizedDisk, normalizedNet);
        }
      }
    };

    window.addEventListener('system-metrics-update', handleMetricsEvent);
    return () => {
      window.removeEventListener('system-metrics-update', handleMetricsEvent);
      apiClient.unsubscribeSystemMetrics();
    };
  }, [handleSystemMetrics]);

  const diskUsagePercent = Math.max(0, Math.min(100, Math.round(diskUsage * 100) / 100));
  const deferredCpuHistory = useDeferredValue(cpuHistory);
  const deferredRamHistory = useDeferredValue(ramHistory);
  const deferredDiskHistory = useDeferredValue(diskHistory);
  const deferredNetworkHistory = useDeferredValue(networkHistory);

  const zoomedCpuHistory = useMemo(
    () => getZoomedData(deferredCpuHistory, sharedZoom, sharedOffset),
    [deferredCpuHistory, sharedZoom, sharedOffset]
  );
  const zoomedRamHistory = useMemo(
    () => getZoomedData(deferredRamHistory, sharedZoom, sharedOffset),
    [deferredRamHistory, sharedZoom, sharedOffset]
  );
  const zoomedDiskHistory = useMemo(
    () => getZoomedData(deferredDiskHistory, sharedZoom, sharedOffset),
    [deferredDiskHistory, sharedZoom, sharedOffset]
  );
  const zoomedNetworkHistory = useMemo(
    () => getZoomedData(deferredNetworkHistory, sharedZoom, sharedOffset),
    [deferredNetworkHistory, sharedZoom, sharedOffset]
  );

  const cpuChartData = useMemo(() => zoomedCpuHistory, [zoomedCpuHistory]);
  const ramChartData = useMemo(() => zoomedRamHistory, [zoomedRamHistory]);
  const diskChartData = useMemo(() => zoomedDiskHistory, [zoomedDiskHistory]);
  const networkChartData = useMemo(() => zoomedNetworkHistory, [zoomedNetworkHistory]);
  const networkInSpeed = formatSpeed(networkIn);
  const networkOutSpeed = formatSpeed(networkOut);
  const historyChartHeight = 250;

  const cardBg = 'bg-[#111827]';
  const cardBorder = 'border-gray-800';
  const cardShadow = '';
  const textPrimary = 'text-white';
  const textSecondary = 'text-gray-400';
  const textTertiary = 'text-gray-500';
  const progressBg = 'bg-gray-700';
  const chartGridColor = ODS_CHART_THEME.grid;
  const chartAxisColor = ODS_CHART_THEME.axis;
  const chartTooltipBg = ODS_CHART_THEME.tooltipBg;
  const chartTooltipBorder = ODS_CHART_THEME.tooltipBorder;

  return (
    <HostStatusView
      cpuUsage={cpuUsage}
      ramUsage={ramUsage}
      diskUsagePercent={diskUsagePercent}
      networkInSpeed={networkInSpeed}
      networkOutSpeed={networkOutSpeed}
      cpuChartData={cpuChartData}
      ramChartData={ramChartData}
      diskChartData={diskChartData}
      networkChartData={networkChartData}
      zoomedCpuHistory={zoomedCpuHistory}
      zoomedRamHistory={zoomedRamHistory}
      zoomedDiskHistory={zoomedDiskHistory}
      zoomedNetworkHistory={zoomedNetworkHistory}
      isDragging={isDragging}
      historyChartHeight={historyChartHeight}
      cardBg={cardBg}
      cardBorder={cardBorder}
      cardShadow={cardShadow}
      textPrimary={textPrimary}
      textSecondary={textSecondary}
      progressBg={progressBg}
      chartGridColor={chartGridColor}
      chartAxisColor={chartAxisColor}
      chartTooltipBg={chartTooltipBg}
      chartTooltipBorder={chartTooltipBorder}
      handleMouseDown={handleMouseDown}
      handleMouseMove={handleMouseMove}
      handleMouseUp={handleMouseUp}
      handleChartWheel={handleChartWheel}
      formatTimelineTick={formatTimelineTick}
      formatTooltipTime={formatTooltipTime}
      calculateYDomain={calculateYDomain}
      calculateNetworkYDomain={calculateNetworkYDomain}
      formatPercentTick={formatPercentTick}
      formatNetworkTick={formatNetworkTick}
      formatSpeed={formatSpeed}
    />
  );
}

