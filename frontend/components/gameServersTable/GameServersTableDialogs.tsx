import { AlertCircle, Check, Copy } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GameServer } from '../../types/gameServer';
import type { ServerHistoryEntry } from '../../utils/serverRuntime';
import {
  formatHistoryTimestamp,
  formatMetricTick,
  formatMetricTooltipLabel,
  formatNetworkSpeed,
  getHistoryLevelClass,
  type MetricType,
} from './utils';
import { PUBLIC_CONNECTION_HOST } from '../../utils/api';
import { AppButton } from '../../src/ui/components';
import { ODS_CHART_THEME } from '../charts/theme';

interface ConnectionPortRow {
  protocol: 'TCP' | 'UDP';
  hostPort: number;
  name: string;
}

interface MetricChartPoint {
  timestamp: number;
  value: number;
}

interface NetworkChartPoint {
  timestamp: number;
  networkIn: number;
  networkOut: number;
}

interface GameServersTableDialogsProps {
  cardBg: string;
  cardBorder: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  rowBorder: string;
  selectedConnectionServer: GameServer | null;
  connectionModalRows: ConnectionPortRow[];
  closeConnectionModal: () => void;
  copyConnectionAddress: (port: number) => void;
  getConnectionCopyState: (port: number) => 'idle' | 'success' | 'error';
  metricModalOpen: boolean;
  selectedMetricServer: GameServer | null;
  metricType: MetricType;
  onChangeMetricType: (type: MetricType) => void;
  metricLabel: string;
  metricModalChartData: MetricChartPoint[];
  metricNetworkChartData: NetworkChartPoint[];
  metricChartColor: string;
  metricDragging: boolean;
  closeMetricModal: () => void;
  handleMetricMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleMetricMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleMetricMouseUp: () => void;
  handleMetricWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  getGameLabel: (server: GameServer) => string;
  historyModalOpen: boolean;
  selectedHistoryServer: GameServer | null;
  historyModalEntries: ServerHistoryEntry[];
  closeHistoryModal: () => void;
}

import { useBodyScrollLock } from '../../src/ui/utils/useBodyScrollLock';

export function GameServersTableDialogs({
  cardBg,
  cardBorder,
  borderColor,
  textPrimary,
  textSecondary,
  textTertiary,
  rowBorder,
  selectedConnectionServer,
  connectionModalRows,
  closeConnectionModal,
  copyConnectionAddress,
  getConnectionCopyState,
  metricModalOpen,
  selectedMetricServer,
  metricType,
  onChangeMetricType,
  metricModalChartData,
  metricNetworkChartData,
  metricChartColor,
  metricDragging,
  closeMetricModal,
  handleMetricMouseDown,
  handleMetricMouseMove,
  handleMetricMouseUp,
  handleMetricWheel,
  getGameLabel,
  historyModalOpen,
  selectedHistoryServer,
  historyModalEntries,
  closeHistoryModal,
}: GameServersTableDialogsProps) {
  useBodyScrollLock(!!selectedConnectionServer || metricModalOpen || historyModalOpen);
  const metricGridColor = ODS_CHART_THEME.grid;
  const metricAxisColor = ODS_CHART_THEME.axis;
  const metricTooltipBg = ODS_CHART_THEME.tooltipBg;
  const metricTooltipBorder = ODS_CHART_THEME.tooltipBorder;

  return (
    <>
      {selectedConnectionServer && (
        <div className="fixed inset-0 z-[82] flex items-center justify-center bg-black/60 p-4">
          <div
            className={`${cardBg} w-full max-w-2xl rounded-xl border ${cardBorder} shadow-2xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex items-start justify-between border-b ${borderColor} p-4 md:p-5`}>
              <div className="min-w-0">
                <h3 className={`text-lg md:text-xl font-semibold ${textPrimary}`}>
                  Connection ports
                </h3>
                <p className={`mt-1 text-sm ${textSecondary}`}>{selectedConnectionServer.name}</p>
              </div>
              <AppButton
                type="button"
                onClick={closeConnectionModal}
                className={`ml-3 rounded p-2 hover:bg-gray-700 transition-colors ${textSecondary} hover:text-red-400`}
                aria-label="Close connection ports"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </AppButton>
            </div>

            <div className="p-4 md:p-5">
              {connectionModalRows.length === 0 ? (
                <p className={`text-sm ${textSecondary}`}>No ports available for this server.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-700/60">
                  <table className="w-full min-w-[620px] text-sm border-collapse">
                    <thead>
                      <tr className="bg-[#0f172a] border-b border-gray-700/60">
                        <th className={`px-3 py-2.5 text-left text-xs font-semibold ${textSecondary} whitespace-nowrap`}>Protocol</th>
                        <th className={`px-3 py-2.5 text-left text-xs font-semibold ${textSecondary} whitespace-nowrap`}>Host Port</th>
                        <th className={`px-3 py-2.5 text-left text-xs font-semibold ${textSecondary} whitespace-nowrap`}>Port Name</th>
                        <th className={`px-3 py-2.5 text-left text-xs font-semibold ${textSecondary} whitespace-nowrap w-full`}>Connection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connectionModalRows.map((row, idx) => {
                        const connectionCopyState = getConnectionCopyState(row.hostPort);
                        return (
                          <tr
                            key={`${row.protocol}-${row.hostPort}`}
                            className={`bg-[#111827] ${idx < connectionModalRows.length - 1 ? 'border-b border-gray-700/40' : ''}`}
                          >
                            <td className={`px-3 py-2.5 ${textPrimary}`}>{row.protocol}</td>
                            <td className={`px-3 py-2.5 font-mono ${textPrimary}`}>{row.hostPort}</td>
                            <td className="px-3 py-2.5">
                              {row.name ? (
                                <span className={`inline-flex items-center rounded-full border border-gray-600 px-2 py-0.5 text-xs ${
                                  String(row.name ?? '').toLowerCase().includes('game')
                                    ? 'text-[var(--color-cyan-400)] border-[var(--color-cyan-400)]/60 bg-[#0050D7]/10'
                                    : 'text-gray-300'
                                }`}>
                                  {row.name}
                                </span>
                              ) : (
                                <span className={textTertiary}>-</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap w-full">
                              <div className="flex items-center justify-between gap-2">
                                <code className="text-xs font-mono px-2 py-1 rounded bg-gray-800 text-cyan-400">
                                  {PUBLIC_CONNECTION_HOST}:{row.hostPort}
                                </code>
                                <AppButton
                                  type="button"
                                  onClick={() => copyConnectionAddress(row.hostPort)}
                                  className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-all ${
                                    connectionCopyState === 'success'
                                      ? 'bg-green-500/20 text-green-400'
                                      : connectionCopyState === 'error'
                                        ? 'bg-red-500/20 text-red-400'
                                        : 'text-gray-400 hover:bg-gray-700/70 hover:text-[var(--color-cyan-400)]'
                                  }`}
                                  title={connectionCopyState === 'success' ? 'Copied!' : connectionCopyState === 'error' ? 'Copy failed' : 'Copy to clipboard'}
                                >
                                  {connectionCopyState === 'success' ? <Check className="w-4 h-4" /> : connectionCopyState === 'error' ? <AlertCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                  <span>{connectionCopyState === 'success' ? 'Copied!' : connectionCopyState === 'error' ? 'Retry' : 'Copy'}</span>
                                </AppButton>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {metricModalOpen && selectedMetricServer && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={closeMetricModal}
        >
          <div
            className={`${cardBg} flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border ${cardBorder} shadow-2xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex-shrink-0 border-b ${borderColor} p-4 md:p-5`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className={`text-lg md:text-xl font-semibold ${textPrimary}`}>
                    Server Metrics
                  </h3>
                  <p className={`mt-1 text-sm ${textSecondary}`}>
                    {selectedMetricServer.name} · {getGameLabel(selectedMetricServer)}
                  </p>
                </div>
                <AppButton
                  type="button"
                  onClick={closeMetricModal}
                  className={`ml-3 rounded p-2 hover:bg-gray-700 transition-colors ${textSecondary} hover:text-red-400`}
                  aria-label="Close metrics history"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </AppButton>
              </div>
              <div className="mt-3 flex gap-1">
                {(['cpu', 'memory', 'disk', 'network'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onChangeMetricType(type)}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      metricType === type
                        ? 'bg-[var(--color-cyan-400)]/15 text-[var(--color-cyan-400)]'
                        : `${textSecondary} hover:bg-gray-700/40 hover:text-gray-100`
                    }`}
                  >
                    {type === 'cpu'
                      ? 'CPU'
                      : type === 'memory'
                        ? 'Memory'
                        : type === 'disk'
                          ? 'Disk'
                          : 'Network'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-4 md:p-5">
              {/* Chart shrinks on short viewports so the modal always fits without scrolling. */}
              <div className="flex h-[clamp(180px,calc(100dvh-13rem),360px)] flex-col">
              {metricType === 'network' ? (
                metricNetworkChartData.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center">
                    <p className={`text-sm ${textSecondary}`}>
                      No metrics history available yet for this server.
                    </p>
                  </div>
                ) : (
                  <div
                    className="flex-1 min-h-0"
                    onMouseDown={handleMetricMouseDown}
                    onMouseMove={handleMetricMouseMove}
                    onMouseUp={handleMetricMouseUp}
                    onMouseLeave={handleMetricMouseUp}
                    onWheel={handleMetricWheel}
                    style={{ cursor: metricDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={metricNetworkChartData}
                        margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                      >
                        <defs>
                          <linearGradient id="networkInGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="5%"
                              stopColor={ODS_CHART_THEME.networkIn}
                              stopOpacity={ODS_CHART_THEME.fillTopStrong}
                            />
                            <stop
                              offset="95%"
                              stopColor={ODS_CHART_THEME.networkIn}
                              stopOpacity={ODS_CHART_THEME.fillBottomNetwork}
                            />
                          </linearGradient>
                          <linearGradient id="networkOutGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="5%"
                              stopColor={ODS_CHART_THEME.networkOut}
                              stopOpacity={ODS_CHART_THEME.fillTopStrong}
                            />
                            <stop
                              offset="95%"
                              stopColor={ODS_CHART_THEME.networkOut}
                              stopOpacity={ODS_CHART_THEME.fillBottomNetwork}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={metricGridColor} />
                        <XAxis
                          dataKey="timestamp"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          stroke={metricAxisColor}
                          style={{ fontSize: '11px' }}
                          tickMargin={8}
                          minTickGap={24}
                          tickFormatter={(value: number | string) => formatMetricTick(value)}
                        />
                        <YAxis
                          stroke={metricAxisColor}
                          style={{ fontSize: '12px' }}
                          tickFormatter={(value: number) => formatNetworkSpeed(value)}
                          width={70}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: metricTooltipBg,
                            border: `1px solid ${metricTooltipBorder}`,
                            borderRadius: '8px',
                          }}
                          labelStyle={{ color: ODS_CHART_THEME.tooltipLabel }}
                          labelFormatter={(value: number | string) =>
                            formatMetricTooltipLabel(value)
                          }
                          formatter={(value: number | string, name: string) => [
                            formatNetworkSpeed(Number(value)),
                            name === 'networkIn' ? 'In' : 'Out',
                          ]}
                          cursor={{ stroke: ODS_CHART_THEME.tooltipCursor, strokeDasharray: '3 3' }}
                        />
                        <Legend
                          formatter={(value: string) => (value === 'networkIn' ? 'In' : 'Out')}
                        />
                        <Area
                          type="monotone"
                          dataKey="networkIn"
                          stroke={ODS_CHART_THEME.networkIn}
                          strokeWidth={ODS_CHART_THEME.lineWidthNetwork}
                          fillOpacity={1}
                          fill="url(#networkInGradient)"
                          isAnimationActive={false}
                          dot={false}
                          activeDot={{
                            r: ODS_CHART_THEME.activeDotRadius,
                            stroke: ODS_CHART_THEME.networkIn,
                            strokeWidth: ODS_CHART_THEME.activeDotStrokeWidth,
                            fill: ODS_CHART_THEME.activeDotFill,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="networkOut"
                          stroke={ODS_CHART_THEME.networkOut}
                          strokeWidth={ODS_CHART_THEME.lineWidthNetwork}
                          fillOpacity={1}
                          fill="url(#networkOutGradient)"
                          isAnimationActive={false}
                          dot={false}
                          activeDot={{
                            r: ODS_CHART_THEME.activeDotRadius,
                            stroke: ODS_CHART_THEME.networkOut,
                            strokeWidth: ODS_CHART_THEME.activeDotStrokeWidth,
                            fill: ODS_CHART_THEME.activeDotFill,
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )
              ) : metricModalChartData.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className={`text-sm ${textSecondary}`}>
                    No metrics history available yet for this server.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="flex-1 min-h-0"
                    onMouseDown={handleMetricMouseDown}
                    onMouseMove={handleMetricMouseMove}
                    onMouseUp={handleMetricMouseUp}
                    onMouseLeave={handleMetricMouseUp}
                    onWheel={handleMetricWheel}
                    style={{ cursor: metricDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={metricModalChartData}
                        margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                      >
                        <defs>
                          <linearGradient id="metricChartColor" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="5%"
                              stopColor={metricChartColor}
                              stopOpacity={ODS_CHART_THEME.fillTopStrong}
                            />
                            <stop
                              offset="95%"
                              stopColor={metricChartColor}
                              stopOpacity={ODS_CHART_THEME.fillBottomSoft}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={metricGridColor} />
                        <XAxis
                          dataKey="timestamp"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          stroke={metricAxisColor}
                          style={{ fontSize: '11px' }}
                          tickMargin={8}
                          minTickGap={24}
                          tickFormatter={(value: number | string) => formatMetricTick(value)}
                        />
                        <YAxis
                          stroke={metricAxisColor}
                          style={{ fontSize: '12px' }}
                          domain={[0, 100]}
                          tickFormatter={(value: number) => `${Math.round(value)}%`}
                          width={45}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: metricTooltipBg,
                            border: `1px solid ${metricTooltipBorder}`,
                            borderRadius: '8px',
                          }}
                          labelStyle={{ color: ODS_CHART_THEME.tooltipLabel }}
                          labelFormatter={(value: number | string) =>
                            formatMetricTooltipLabel(value)
                          }
                          formatter={(value: number | string) => {
                            const numericValue = Number(value);
                            return Number.isFinite(numericValue)
                              ? `${numericValue.toFixed(2)}%`
                              : String(value);
                          }}
                          cursor={{ stroke: ODS_CHART_THEME.tooltipCursor, strokeDasharray: '3 3' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke={metricChartColor}
                          strokeWidth={ODS_CHART_THEME.lineWidthMain}
                          fillOpacity={1}
                          fill="url(#metricChartColor)"
                          isAnimationActive={false}
                          dot={false}
                          activeDot={{
                            r: ODS_CHART_THEME.activeDotRadius,
                            stroke: metricChartColor,
                            strokeWidth: ODS_CHART_THEME.activeDotStrokeWidth,
                            fill: ODS_CHART_THEME.activeDotFill,
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {historyModalOpen && selectedHistoryServer && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={closeHistoryModal}
        >
          <div
            className={`${cardBg} w-full max-w-3xl rounded-xl border ${cardBorder} shadow-2xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex items-start justify-between border-b ${borderColor} p-4 md:p-5`}>
              <div className="min-w-0">
                <h3 className={`text-lg md:text-xl font-semibold ${textPrimary}`}>
                  Actions history
                </h3>
                <p className={`mt-1 text-sm ${textSecondary}`}>{selectedHistoryServer.name}</p>
              </div>
              <AppButton
                type="button"
                onClick={closeHistoryModal}
                className={`ml-3 rounded p-2 hover:bg-gray-700 transition-colors ${textSecondary} hover:text-red-400`}
                aria-label="Close history logs"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </AppButton>
            </div>

            <div className="p-4 md:p-5 max-h-[65vh] overflow-y-auto">
              {historyModalEntries.length === 0 ? (
                <p className={`text-sm ${textSecondary}`}>
                  No history logs available yet for this server.
                </p>
              ) : (
                <div className="space-y-2">
                  {historyModalEntries.map((entry, index) => (
                    <div
                      key={`${entry.id}-${entry.timestamp}-${index}`}
                      className={`rounded-lg border ${rowBorder} bg-[#0f172a] p-3`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getHistoryLevelClass(entry.level)}`}
                        >
                          {entry.level}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatHistoryTimestamp(entry.timestamp)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-200 whitespace-pre-wrap break-words">
                        {entry.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}



