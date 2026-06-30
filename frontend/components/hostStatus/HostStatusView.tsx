import { memo, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { Activity, Cpu, Network, TrendingUp, TrendingDown, HardDrive } from 'lucide-react';
import { AppCard } from '../../src/ui/components';
import { ODS_CHART_THEME } from '../charts/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function ChartZoomArea({
  onWheel, onMouseDown, onMouseMove, onMouseUp, onMouseLeave, style, children,
}: {
  onWheel: (e: WheelEvent) => void;
  onMouseDown?: (e: MouseEvent<HTMLDivElement>) => void;
  onMouseMove?: (e: MouseEvent<HTMLDivElement>) => void;
  onMouseUp?: () => void;
  onMouseLeave?: () => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);
  return (
    <div ref={ref} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onMouseLeave={onMouseLeave} style={style}>
      {children}
    </div>
  );
}

type UsageChartPoint = { time: string; timestamp: number; value: number | null };
type NetworkChartPoint = { time: string; timestamp: number; in: number | null; out: number | null };

interface NetworkSpeed {
  value: number;
  unit: string;
}

interface HostStatusViewProps {
  cpuUsage: number;
  ramUsage: number;
  diskUsagePercent: number;
  networkInSpeed: NetworkSpeed;
  networkOutSpeed: NetworkSpeed;
  cpuChartData: UsageChartPoint[];
  ramChartData: UsageChartPoint[];
  diskChartData: UsageChartPoint[];
  networkChartData: NetworkChartPoint[];
  zoomedCpuHistory: UsageChartPoint[];
  zoomedRamHistory: UsageChartPoint[];
  zoomedDiskHistory: UsageChartPoint[];
  zoomedNetworkHistory: NetworkChartPoint[];
  isDragging: boolean;
  historyChartHeight: number;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  textPrimary: string;
  textSecondary: string;
  progressBg: string;
  chartGridColor: string;
  chartAxisColor: string;
  chartTooltipBg: string;
  chartTooltipBorder: string;
  selectedTimeRange: '1h' | '3h' | '6h' | '12h' | '24h';
  onSetTimeRange: (range: '1h' | '3h' | '6h' | '12h' | '24h') => void;
  handleMouseDown: (event: MouseEvent) => void;
  handleMouseMove: (event: MouseEvent) => void;
  handleMouseUp: () => void;
  handleChartWheel: (event: WheelEvent) => void;
  formatTimelineTick: (timestamp: number) => string;
  formatTooltipTime: (label: unknown) => string;
  calculateYDomain: (data: Array<{ value: number | null }>) => number[];
  calculateNetworkYDomain: (data: Array<{ in: number | null; out: number | null }>) => number[];
  formatPercentTick: (value: number) => string;
  formatNetworkTick: (value: number) => string;
  formatSpeed: (kilobytesPerSecond: number) => { value: number; unit: string };
}

export const HostStatusView = memo(function HostStatusView({
  cpuUsage,
  ramUsage,
  diskUsagePercent,
  networkInSpeed,
  networkOutSpeed,
  cpuChartData,
  ramChartData,
  diskChartData,
  networkChartData,
  zoomedCpuHistory,
  zoomedRamHistory,
  zoomedDiskHistory,
  zoomedNetworkHistory,
  isDragging,
  historyChartHeight,
  cardBg,
  cardBorder,
  cardShadow,
  textPrimary,
  textSecondary,
  progressBg,
  chartGridColor,
  chartAxisColor,
  chartTooltipBg,
  chartTooltipBorder,
  selectedTimeRange,
  onSetTimeRange,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleChartWheel,
  formatTimelineTick,
  formatTooltipTime,
  calculateYDomain,
  calculateNetworkYDomain,
  formatPercentTick,
  formatNetworkTick,
  formatSpeed,
}: HostStatusViewProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const historyCurveColor = ODS_CHART_THEME.cpu;
  const usageBarColor = ODS_CHART_THEME.progressCpu;
  const networkInColor  = isDark ? ODS_CHART_THEME.networkOut : '#7c3aed';
  const networkOutColor = isDark ? ODS_CHART_THEME.networkIn  : ODS_CHART_THEME.cpu;
  const networkHistoryInColor  = networkInColor;
  const networkHistoryOutColor = networkOutColor;

  return (
    <div className="space-y-3 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-6">
        <AppCard className={`${cardBg} h-full rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5" style={{ color: ODS_CHART_THEME.cpu }} />
              <span className={`${textSecondary} text-sm`}>CPU Usage</span>
            </div>
          </div>
          <div className={`text-3xl font-bold ${textPrimary} mb-2`}>{cpuUsage}%</div>
          <div className={`h-1 ${progressBg} rounded-full overflow-hidden`}>
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${cpuUsage}%`, backgroundColor: usageBarColor }}
            ></div>
          </div>
        </AppCard>

        <AppCard className={`${cardBg} rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5" style={{ color: ODS_CHART_THEME.ram }} />
              <span className={`${textSecondary} text-sm`}>RAM Usage</span>
            </div>
          </div>
          <div className={`text-3xl font-bold ${textPrimary} mb-2`}>{ramUsage}%</div>
          <div className={`h-1 ${progressBg} rounded-full overflow-hidden`}>
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${ramUsage}%`, backgroundColor: usageBarColor }}
            ></div>
          </div>
        </AppCard>

        <AppCard className={`${cardBg} rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" style={{ color: ODS_CHART_THEME.disk }} />
              <span className={`${textSecondary} text-sm`}>Disk Usage</span>
            </div>
          </div>
          <div className={`text-3xl font-bold ${textPrimary} mb-2`}>{diskUsagePercent}%</div>
          <div className={`h-1 ${progressBg} rounded-full overflow-hidden`}>
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${diskUsagePercent}%`, backgroundColor: usageBarColor }}
            ></div>
          </div>
        </AppCard>

        <AppCard className={`${cardBg} h-full rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5" style={{ color: networkInColor }} />
              <span className={`${textSecondary} text-sm`}>Network I/O</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div
              className="rounded-md px-2.5 py-2"
              style={{
                border: `1px solid color-mix(in srgb, ${networkInColor} 46%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${networkInColor} 12%, transparent)`,
              }}
            >
              <div
                className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: networkInColor }}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                In
              </div>
              <div className={`mt-1 flex items-baseline gap-1 ${textPrimary}`}>
                <span className="text-xl font-semibold">{networkInSpeed.value}</span>
                <span className="text-[10px] font-semibold" style={{ color: networkInColor }}>
                  {networkInSpeed.unit}
                </span>
              </div>
            </div>
            <div
              className="rounded-md px-2.5 py-2"
              style={{
                border: `1px solid color-mix(in srgb, ${networkOutColor} 46%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${networkOutColor} 12%, transparent)`,
              }}
            >
              <div
                className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: networkOutColor }}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Out
              </div>
              <div className={`mt-1 flex items-baseline gap-1 ${textPrimary}`}>
                <span className="text-xl font-semibold">{networkOutSpeed.value}</span>
                <span className="text-[10px] font-semibold" style={{ color: networkOutColor }}>
                  {networkOutSpeed.unit}
                </span>
              </div>
            </div>
          </div>
        </AppCard>
      </div>

      <div className="gp-host-range flex items-center gap-2">
        {(['1h', '3h', '6h', '12h', '24h'] as const).map((range) => (
          <button
            key={range}
            onClick={() => onSetTimeRange(range)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              selectedTimeRange === range
                ? 'bg-[var(--gp-primary-300)] text-[var(--gp-tab-active-text)]'
                : 'bg-white/10 text-gray-400 hover:bg-white/15 hover:text-gray-200'
            }`}
          >
            {range}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
        <AppCard className={`${cardBg} h-full rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <h3 className={`text-base md:text-lg mb-3 md:mb-4 flex items-center gap-2 ${textPrimary}`}>
            <Cpu className="w-5 h-5" style={{ color: ODS_CHART_THEME.cpu }} />
            CPU History
          </h3>
          <ChartZoomArea
            onWheel={handleChartWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          >
            <ResponsiveContainer width="100%" height={historyChartHeight}>
              <AreaChart data={cpuChartData} syncId="systemHistory" syncMethod="value">
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={ODS_CHART_THEME.cpu}
                      stopOpacity={ODS_CHART_THEME.fillTopStrong}
                    />
                    <stop
                      offset="95%"
                      stopColor={ODS_CHART_THEME.cpu}
                      stopOpacity={ODS_CHART_THEME.fillBottomSoft}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  stroke={chartAxisColor}
                  style={{ fontSize: '11px' }}
                  tickFormatter={(value) => formatTimelineTick(Number(value))}
                  minTickGap={28}
                />
                <YAxis
                  stroke={chartAxisColor}
                  style={{ fontSize: '13px', fontWeight: '500' }}
                  domain={calculateYDomain(zoomedCpuHistory)}
                  tickFormatter={formatPercentTick}
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTooltipBg,
                    border: `1px solid ${chartTooltipBorder}`,
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: ODS_CHART_THEME.tooltipLabel }}
                  cursor={{ stroke: ODS_CHART_THEME.tooltipCursor, strokeDasharray: '3 3' }}
                  labelFormatter={formatTooltipTime}
                  formatter={(value: any) => `${value}%`}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={ODS_CHART_THEME.cpu}
                  strokeWidth={ODS_CHART_THEME.lineWidthMain}
                  fillOpacity={1}
                  fill="url(#colorCpu)"
                  isAnimationActive={false}
                  dot={false}
                  connectNulls={false}
                  activeDot={{
                    r: ODS_CHART_THEME.activeDotRadius,
                    stroke: ODS_CHART_THEME.cpu,
                    strokeWidth: ODS_CHART_THEME.activeDotStrokeWidth,
                    fill: ODS_CHART_THEME.activeDotFill,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartZoomArea>
        </AppCard>

        <AppCard className={`${cardBg} h-full rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <h3 className={`text-base md:text-lg mb-3 md:mb-4 flex items-center gap-2 ${textPrimary}`}>
            <Activity className="w-5 h-5" style={{ color: ODS_CHART_THEME.ram }} />
            RAM History
          </h3>
          <ChartZoomArea
            onWheel={handleChartWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          >
            <ResponsiveContainer width="100%" height={historyChartHeight}>
              <AreaChart data={ramChartData} syncId="systemHistory" syncMethod="value">
                <defs>
                  <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={historyCurveColor}
                      stopOpacity={ODS_CHART_THEME.fillTopStrong}
                    />
                    <stop
                      offset="95%"
                      stopColor={historyCurveColor}
                      stopOpacity={ODS_CHART_THEME.fillBottomSoft}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  stroke={chartAxisColor}
                  style={{ fontSize: '11px' }}
                  tickFormatter={(value) => formatTimelineTick(Number(value))}
                  minTickGap={28}
                />
                <YAxis
                  stroke={chartAxisColor}
                  style={{ fontSize: '13px', fontWeight: '500' }}
                  domain={calculateYDomain(zoomedRamHistory)}
                  tickFormatter={formatPercentTick}
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTooltipBg,
                    border: `1px solid ${chartTooltipBorder}`,
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: ODS_CHART_THEME.tooltipLabel }}
                  cursor={{ stroke: ODS_CHART_THEME.tooltipCursor, strokeDasharray: '3 3' }}
                  labelFormatter={formatTooltipTime}
                  formatter={(value: any) => `${value}%`}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={historyCurveColor}
                  strokeWidth={ODS_CHART_THEME.lineWidthMain}
                  fillOpacity={1}
                  fill="url(#colorRam)"
                  isAnimationActive={false}
                  dot={false}
                  connectNulls={false}
                  activeDot={{
                    r: ODS_CHART_THEME.activeDotRadius,
                    stroke: historyCurveColor,
                    strokeWidth: ODS_CHART_THEME.activeDotStrokeWidth,
                    fill: ODS_CHART_THEME.activeDotFill,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartZoomArea>
        </AppCard>

        <AppCard className={`${cardBg} rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <h3 className={`text-base md:text-lg mb-3 md:mb-4 flex items-center gap-2 ${textPrimary}`}>
            <HardDrive className="w-5 h-5" style={{ color: ODS_CHART_THEME.disk }} />
            Disk History
          </h3>
          <ChartZoomArea
            onWheel={handleChartWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          >
            <ResponsiveContainer width="100%" height={historyChartHeight}>
              <AreaChart data={diskChartData} syncId="systemHistory" syncMethod="value">
                <defs>
                  <linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={historyCurveColor}
                      stopOpacity={ODS_CHART_THEME.fillTopStrong}
                    />
                    <stop
                      offset="95%"
                      stopColor={historyCurveColor}
                      stopOpacity={ODS_CHART_THEME.fillBottomSoft}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  stroke={chartAxisColor}
                  style={{ fontSize: '11px' }}
                  tickFormatter={(value) => formatTimelineTick(Number(value))}
                  minTickGap={28}
                />
                <YAxis
                  stroke={chartAxisColor}
                  style={{ fontSize: '13px', fontWeight: '500' }}
                  domain={calculateYDomain(zoomedDiskHistory)}
                  tickFormatter={formatPercentTick}
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTooltipBg,
                    border: `1px solid ${chartTooltipBorder}`,
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: ODS_CHART_THEME.tooltipLabel }}
                  cursor={{ stroke: ODS_CHART_THEME.tooltipCursor, strokeDasharray: '3 3' }}
                  labelFormatter={formatTooltipTime}
                  formatter={(value: any) => `${value}%`}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={historyCurveColor}
                  strokeWidth={ODS_CHART_THEME.lineWidthMain}
                  fillOpacity={1}
                  fill="url(#colorDisk)"
                  isAnimationActive={false}
                  dot={false}
                  connectNulls={false}
                  activeDot={{
                    r: ODS_CHART_THEME.activeDotRadius,
                    stroke: historyCurveColor,
                    strokeWidth: ODS_CHART_THEME.activeDotStrokeWidth,
                    fill: ODS_CHART_THEME.activeDotFill,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartZoomArea>
        </AppCard>

        <AppCard className={`${cardBg} rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className={`text-base md:text-lg flex items-center gap-2 ${textPrimary}`}>
              <Network className="w-5 h-5" style={{ color: networkInColor }} />
              Network History
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="block w-5 h-0.5 rounded-full" style={{ backgroundColor: networkHistoryInColor }} />
                <span className="text-xs font-semibold" style={{ color: networkHistoryInColor }}>IN</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="block w-5 h-0.5 rounded-full" style={{ backgroundColor: networkHistoryOutColor }} />
                <span className="text-xs font-semibold" style={{ color: networkHistoryOutColor }}>OUT</span>
              </div>
            </div>
          </div>
          <ChartZoomArea
            onWheel={handleChartWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          >
            <ResponsiveContainer width="100%" height={historyChartHeight}>
              <AreaChart data={networkChartData} syncId="systemHistory" syncMethod="value">
                <defs>
                  <linearGradient id="colorNetworkIn" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={networkHistoryInColor}
                      stopOpacity={ODS_CHART_THEME.fillTopStrong}
                    />
                    <stop
                      offset="95%"
                      stopColor={networkHistoryInColor}
                      stopOpacity={ODS_CHART_THEME.fillBottomNetwork}
                    />
                  </linearGradient>
                  <linearGradient id="colorNetworkOut" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={networkHistoryOutColor}
                      stopOpacity={ODS_CHART_THEME.fillTopStrong}
                    />
                    <stop
                      offset="95%"
                      stopColor={networkHistoryOutColor}
                      stopOpacity={ODS_CHART_THEME.fillBottomNetwork}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  stroke={chartAxisColor}
                  style={{ fontSize: '11px' }}
                  tickFormatter={(value) => formatTimelineTick(Number(value))}
                  minTickGap={28}
                />
                <YAxis
                  stroke={chartAxisColor}
                  style={{ fontSize: '13px', fontWeight: '500' }}
                  domain={calculateNetworkYDomain(zoomedNetworkHistory)}
                  tickFormatter={formatNetworkTick}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTooltipBg,
                    border: `1px solid ${chartTooltipBorder}`,
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: ODS_CHART_THEME.tooltipLabel }}
                  labelFormatter={formatTooltipTime}
                  formatter={(value: any) => {
                    if (typeof value === 'number') {
                      const formatted = formatSpeed(value);
                      return `${formatted.value} ${formatted.unit}`;
                    }
                    return value;
                  }}
                  cursor={{ stroke: ODS_CHART_THEME.tooltipCursor, strokeDasharray: '3 3' }}
                />
                <Area
                  type="monotone"
                  dataKey="in"
                  stroke={networkHistoryInColor}
                  strokeWidth={ODS_CHART_THEME.lineWidthNetwork}
                  fill="url(#colorNetworkIn)"
                  name="Incoming"
                  isAnimationActive={false}
                  dot={false}
                  connectNulls={false}
                  activeDot={{
                    r: ODS_CHART_THEME.activeDotRadius,
                    stroke: networkHistoryInColor,
                    strokeWidth: ODS_CHART_THEME.activeDotStrokeWidth,
                    fill: ODS_CHART_THEME.activeDotFill,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="out"
                  stroke={networkHistoryOutColor}
                  strokeWidth={ODS_CHART_THEME.lineWidthNetwork}
                  fill="url(#colorNetworkOut)"
                  name="Outgoing"
                  isAnimationActive={false}
                  dot={false}
                  connectNulls={false}
                  activeDot={{
                    r: ODS_CHART_THEME.activeDotRadius,
                    stroke: networkHistoryOutColor,
                    strokeWidth: ODS_CHART_THEME.activeDotStrokeWidth,
                    fill: ODS_CHART_THEME.activeDotFill,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartZoomArea>
        </AppCard>
      </div>
    </div>
  );
});

