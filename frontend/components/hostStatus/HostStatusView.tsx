import type { MouseEvent, WheelEvent } from 'react';
import { Activity, Cpu, Network, TrendingUp, TrendingDown, HardDrive } from 'lucide-react';
import { AppCard } from '../../src/ui/components';
import { ODS_CHART_THEME } from '../charts/theme';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

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

export function HostStatusView({
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
  const historyCurveColor = ODS_CHART_THEME.cpu;
  const usageBarColor = ODS_CHART_THEME.progressCpu;
  const networkHistoryInColor = ODS_CHART_THEME.networkOut;
  const networkHistoryOutColor = ODS_CHART_THEME.networkIn;

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
              <Network className="w-5 h-5" style={{ color: ODS_CHART_THEME.networkIn }} />
              <span className={`${textSecondary} text-sm`}>Network I/O</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div
              className="rounded-md px-2.5 py-2"
              style={{
                border: `1px solid ${ODS_CHART_THEME.networkIn}75`,
                backgroundColor: `${ODS_CHART_THEME.networkIn}1F`,
              }}
            >
              <div
                className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: ODS_CHART_THEME.networkIn }}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                In
              </div>
              <div className={`mt-1 flex items-baseline gap-1 ${textPrimary}`}>
                <span className="text-xl font-semibold">{networkInSpeed.value}</span>
                <span className="text-[10px] font-semibold" style={{ color: ODS_CHART_THEME.networkIn }}>
                  {networkInSpeed.unit}
                </span>
              </div>
            </div>
            <div
              className="rounded-md px-2.5 py-2"
              style={{
                border: `1px solid ${ODS_CHART_THEME.networkIn}75`,
                backgroundColor: `${ODS_CHART_THEME.networkIn}1F`,
              }}
            >
              <div
                className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: ODS_CHART_THEME.networkIn }}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Out
              </div>
              <div className={`mt-1 flex items-baseline gap-1 ${textPrimary}`}>
                <span className="text-xl font-semibold">{networkOutSpeed.value}</span>
                <span className="text-[10px] font-semibold" style={{ color: ODS_CHART_THEME.networkIn }}>
                  {networkOutSpeed.unit}
                </span>
              </div>
            </div>
          </div>
        </AppCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
        <AppCard className={`${cardBg} h-full rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <h3 className={`text-base md:text-lg mb-3 md:mb-4 flex items-center gap-2 ${textPrimary}`}>
            <Cpu className="w-5 h-5" style={{ color: ODS_CHART_THEME.cpu }} />
            CPU History
          </h3>
          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleChartWheel}
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
          </div>
        </AppCard>

        <AppCard className={`${cardBg} h-full rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <h3 className={`text-base md:text-lg mb-3 md:mb-4 flex items-center gap-2 ${textPrimary}`}>
            <Activity className="w-5 h-5" style={{ color: ODS_CHART_THEME.ram }} />
            RAM History
          </h3>
          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleChartWheel}
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
          </div>
        </AppCard>

        <AppCard className={`${cardBg} rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <h3 className={`text-base md:text-lg mb-3 md:mb-4 flex items-center gap-2 ${textPrimary}`}>
            <HardDrive className="w-5 h-5" style={{ color: ODS_CHART_THEME.disk }} />
            Disk History
          </h3>
          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleChartWheel}
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
          </div>
        </AppCard>

        <AppCard className={`${cardBg} rounded-lg p-4 md:p-6 border ${cardBorder} ${cardShadow}`}>
          <h3 className={`text-base md:text-lg mb-3 md:mb-4 flex items-center gap-2 ${textPrimary}`}>
            <Network className="w-5 h-5" style={{ color: ODS_CHART_THEME.networkIn }} />
            Network History
          </h3>
          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleChartWheel}
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
          </div>
        </AppCard>
      </div>
    </div>
  );
}

