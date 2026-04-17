import { ChevronDown, Wifi, Plus, Trash2 } from 'lucide-react';
import { AppButton, AppInput, AppTable } from '../../src/ui/components';

interface PortRow {
  id: string;
  hostPort: string;
  containerPort: string;
  label: string;
}

interface PortsSectionProps {
  borderColor: string;
  collapseBg: string;
  textPrimary: string;
  textSecondary: string;
  inputBg: string;
  inputBorder: string;
  inputFocus: string;
  tagBg: string;
  showPorts: boolean;
  setShowPorts: (show: boolean) => void;
  totalPorts: number;
  isLoading: boolean;
  addTcpPort: () => void;
  addUdpPort: () => void;
  tcpRows: PortRow[];
  udpRows: PortRow[];
  usedTcpPorts: Set<number>;
  usedUdpPorts: Set<number>;
  handleTcpHostPortChange: (rowId: string, value: string) => void;
  handleTcpContainerPortChange: (rowId: string, value: string) => void;
  handleUdpHostPortChange: (rowId: string, value: string) => void;
  handleUdpContainerPortChange: (rowId: string, value: string) => void;
  handleTcpPortLabelChange: (rowId: string, value: string) => void;
  handleUdpPortLabelChange: (rowId: string, value: string) => void;
  removeTcpPort: (rowId: string) => void;
  removeUdpPort: (rowId: string) => void;
}

export function PortsSection({
  borderColor,
  collapseBg,
  textPrimary,
  textSecondary,
  inputBg,
  inputBorder,
  inputFocus,
  tagBg,
  showPorts,
  setShowPorts,
  totalPorts,
  isLoading,
  addTcpPort,
  addUdpPort,
  tcpRows,
  udpRows,
  usedTcpPorts,
  usedUdpPorts,
  handleTcpHostPortChange,
  handleTcpContainerPortChange,
  handleUdpHostPortChange,
  handleUdpContainerPortChange,
  handleTcpPortLabelChange,
  handleUdpPortLabelChange,
  removeTcpPort,
  removeUdpPort,
}: PortsSectionProps) {
  return (
    <div className={`border ${borderColor} rounded-xl overflow-hidden`}>
      <AppButton
        onClick={() => setShowPorts(!showPorts)}
        className={`w-full px-5 py-3.5 flex items-center justify-between ${collapseBg} transition-all`}
        disabled={isLoading}
      >
        <span className={`font-semibold ${textPrimary} flex items-center gap-2`}>
          <Wifi className="w-4 h-4" />
          Network Ports
          {totalPorts > 0 && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tagBg}`}>
              {totalPorts}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-5 h-5 ${textSecondary} transition-transform duration-300 ${
            showPorts ? 'rotate-180' : ''
          }`}
        />
      </AppButton>

      {showPorts && (
        <div className="p-5 space-y-6 border-t border-gray-700/20">
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3
                className={`text-xs font-bold uppercase tracking-wider ${textSecondary} flex items-center gap-2`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                TCP Ports
              </h3>
              <AppButton
                type="button"
                onClick={addTcpPort}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-cyan-400)]/50 bg-[#0050D7]/10 px-2 py-1 text-xs font-semibold text-[var(--color-cyan-400)] transition-colors hover:bg-[#157EEA]/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </AppButton>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-700/30">
              <AppTable className="w-full table-fixed text-sm">
                <thead className="bg-[#0f1723]/70">
                  <tr>
                    <th className={`w-[30%] px-3 py-2 text-left text-xs font-semibold ${textSecondary}`}>
                      Host Port
                    </th>
                    <th className={`w-[30%] px-3 py-2 text-left text-xs font-semibold ${textSecondary}`}>
                      Container Port
                    </th>
                    <th className={`w-[30%] px-3 py-2 text-left text-xs font-semibold ${textSecondary}`}>
                      Port Name
                    </th>
                    <th className={`w-[64px] px-3 py-2 text-right text-xs font-semibold ${textSecondary}`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {tcpRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={`px-3 py-3 text-sm ${textSecondary}`}>
                        No TCP ports configured.
                      </td>
                    </tr>
                  ) : (
                    tcpRows.map((row) => (
                      <tr key={row.id} className="bg-[#0f1723]/40">
                        <td className="w-[30%] px-2 py-2 align-top">
                          <AppInput
                            type="number"
                            min="1024"
                            max="65535"
                            value={row.hostPort}
                            onChange={(e) => handleTcpHostPortChange(row.id, e.target.value)}
                            disabled={isLoading}
                            className={`w-full px-3 py-2 text-sm font-mono font-bold ${inputBg} border ${
                              usedTcpPorts.has(Number(row.hostPort))
                                ? 'border-red-500 text-red-300'
                                : inputBorder
                            } rounded-lg ${
                              usedTcpPorts.has(Number(row.hostPort)) ? '' : textPrimary
                            } ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
                          />
                        </td>
                        <td className="w-[30%] px-2 py-2 align-top">
                          <AppInput
                            type="number"
                            min="1024"
                            max="65535"
                            value={row.containerPort}
                            onChange={(e) => handleTcpContainerPortChange(row.id, e.target.value)}
                            disabled={isLoading}
                            className={`w-full px-3 py-2 text-sm font-mono font-bold ${inputBg} border ${inputBorder} rounded-lg ${textPrimary} ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
                          />
                        </td>
                        <td className="w-[30%] px-2 py-2 align-top">
                          <AppInput
                            type="text"
                            value={row.label}
                            onChange={(e) => handleTcpPortLabelChange(row.id, e.target.value)}
                            disabled={isLoading}
                            className={`w-full px-3 py-2 text-sm ${inputBg} border ${inputBorder} rounded-lg ${textPrimary} ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
                          />
                        </td>
                        <td className="w-[84px] px-2 py-2 align-middle">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <AppButton
                              type="button"
                              onClick={() => removeTcpPort(row.id)}
                              disabled={isLoading}
                              className="inline-flex items-center justify-center rounded-md p-1.5 text-red-300 transition-colors hover:bg-red-500/20 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Remove TCP port"
                            >
                              <Trash2 className="h-4 w-4" />
                            </AppButton>
                            {usedTcpPorts.has(Number(row.hostPort)) && (
                              <span className="text-xs font-semibold text-red-400">Used</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </AppTable>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3
                className={`text-xs font-bold uppercase tracking-wider ${textSecondary} flex items-center gap-2`}
              >
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                UDP Ports
              </h3>
              <AppButton
                type="button"
                onClick={addUdpPort}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-cyan-400)]/50 bg-[#0050D7]/10 px-2 py-1 text-xs font-semibold text-[var(--color-cyan-400)] transition-colors hover:bg-[#157EEA]/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </AppButton>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-700/30">
              <AppTable className="w-full table-fixed text-sm">
                <thead className="bg-[#0f1723]/70">
                  <tr>
                    <th className={`w-[30%] px-3 py-2 text-left text-xs font-semibold ${textSecondary}`}>
                      Host Port
                    </th>
                    <th className={`w-[30%] px-3 py-2 text-left text-xs font-semibold ${textSecondary}`}>
                      Container Port
                    </th>
                    <th className={`w-[30%] px-3 py-2 text-left text-xs font-semibold ${textSecondary}`}>
                      Port Name
                    </th>
                    <th className={`w-[64px] px-3 py-2 text-right text-xs font-semibold ${textSecondary}`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {udpRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={`px-3 py-3 text-sm ${textSecondary}`}>
                        No UDP ports configured.
                      </td>
                    </tr>
                  ) : (
                    udpRows.map((row) => (
                      <tr key={row.id} className="bg-[#0f1723]/40">
                        <td className="w-[30%] px-2 py-2 align-top">
                          <AppInput
                            type="number"
                            min="1024"
                            max="65535"
                            value={row.hostPort}
                            onChange={(e) => handleUdpHostPortChange(row.id, e.target.value)}
                            disabled={isLoading}
                            className={`w-full px-3 py-2 text-sm font-mono font-bold ${inputBg} border ${
                              usedUdpPorts.has(Number(row.hostPort))
                                ? 'border-red-500 text-red-300'
                                : inputBorder
                            } rounded-lg ${
                              usedUdpPorts.has(Number(row.hostPort)) ? '' : textPrimary
                            } ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
                          />
                        </td>
                        <td className="w-[30%] px-2 py-2 align-top">
                          <AppInput
                            type="number"
                            min="1024"
                            max="65535"
                            value={row.containerPort}
                            onChange={(e) => handleUdpContainerPortChange(row.id, e.target.value)}
                            disabled={isLoading}
                            className={`w-full px-3 py-2 text-sm font-mono font-bold ${inputBg} border ${inputBorder} rounded-lg ${textPrimary} ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
                          />
                        </td>
                        <td className="w-[30%] px-2 py-2 align-top">
                          <AppInput
                            type="text"
                            value={row.label}
                            onChange={(e) => handleUdpPortLabelChange(row.id, e.target.value)}
                            disabled={isLoading}
                            className={`w-full px-3 py-2 text-sm ${inputBg} border ${inputBorder} rounded-lg ${textPrimary} ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
                          />
                        </td>
                        <td className="w-[84px] px-2 py-2 align-middle">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <AppButton
                              type="button"
                              onClick={() => removeUdpPort(row.id)}
                              disabled={isLoading}
                              className="inline-flex items-center justify-center rounded-md p-1.5 text-red-300 transition-colors hover:bg-red-500/20 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Remove UDP port"
                            >
                              <Trash2 className="h-4 w-4" />
                            </AppButton>
                            {usedUdpPorts.has(Number(row.hostPort)) && (
                              <span className="text-xs font-semibold text-red-400">Used</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </AppTable>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



