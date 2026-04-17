import { useState, useEffect, useMemo, useRef } from 'react';
import { X, AlertCircle, Server } from 'lucide-react';
import { PortsSection } from './installGameModal/PortsSection';
import { AdvancedSection } from './installGameModal/AdvancedSection';
import { AppButton, AppInput } from '../src/ui/components';

interface InstallGameModalProps {
  isOpen: boolean;
  hideBackdrop?: boolean;
  gameKey: string;
  gameName: string;
  gameServerName?: string;
  requireSteamCredentials?: boolean;
  dockerImage?: string | null;
  healthcheck?: InstallHealthcheckPayload | null;
  usedPorts?: {
    tcp?: number[];
    udp?: number[];
  };
  usedServerNames?: string[];
  initialConfig?: Partial<InstallRequestPayload> | null;
  portsDefinition?: {
    tcp?: Record<string, string> | null;
    udp?: Record<string, string> | null;
  };
  onConfirm: (data: InstallRequestPayload) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
}

interface PortsPayload {
  tcp: Record<string, number>;
  udp: Record<string, number>;
}

interface PortLabelsPayload {
  tcp: Record<string, string>;
  udp: Record<string, string>;
}

interface PortRow {
  id: string;
  hostPort: string;
  containerPort: string;
  label: string;
}

export interface InstallHealthcheckPayload {
  type: string;
  port?: number;
  name?: string;
}

export interface InstallRequestPayload {
  serverName: string;
  gameServerName: string;
  requireSteamCredentials?: boolean;
  steamUsername?: string;
  steamPassword?: string;
  ports: PortsPayload;
  portLabels: PortLabelsPayload;
  healthcheck: InstallHealthcheckPayload;
}

export function InstallGameModal({
  isOpen,
  hideBackdrop = false,
  gameKey,
  gameName,
  gameServerName,
  requireSteamCredentials = false,
  dockerImage,
  healthcheck,
  usedPorts,
  usedServerNames,
  initialConfig,
  portsDefinition,
  onConfirm,
  onCancel,
  isLoading = false,
  error = null,
}: InstallGameModalProps) {
  const [serverName, setServerName] = useState(`${gameName} Server`);
  const [tcpRows, setTcpRows] = useState<PortRow[]>([]);
  const [udpRows, setUdpRows] = useState<PortRow[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showPorts, setShowPorts] = useState(false);
  const [showHealthcheckAdvanced, setShowHealthcheckAdvanced] = useState(false);
  const [healthcheckType, setHealthcheckType] = useState<'default' | 'tcp_connect' | 'process'>(
    'default'
  );
  const [steamUsername, setSteamUsername] = useState('');
  const [steamPassword, setSteamPassword] = useState('');
  const [healthcheckPort, setHealthcheckPort] = useState('');
  const [healthcheckProcess, setHealthcheckProcess] = useState('');
  const modalSessionRef = useRef<{ wasOpen: boolean; gameKey: string | null }>({
    wasOpen: false,
    gameKey: null,
  });
  const nextPortRowIdRef = useRef(0);

  const createPortRow = (hostPort: number | string, containerPort: number | string, label = ''): PortRow => ({
    id: `port-row-${nextPortRowIdRef.current++}`,
    hostPort: String(hostPort),
    containerPort: String(containerPort),
    label: normalizePortLabel(label),
  });

  const normalizePortLabel = (value: unknown): string =>
    String(value ?? '');

  const normalizePortList = (ports?: Record<string, unknown> | null) => {
    if (!ports) return [] as number[];
    const entries = Object.entries(ports);
    if (entries.length === 0) return [] as number[];

    const parsed = entries
      .map(([key, value]) => {
        const keyPort = Number(key);
        if (!Number.isNaN(keyPort) && keyPort > 0) return keyPort;
        const valuePort = Number(value);
        if (!Number.isNaN(valuePort) && valuePort > 0) return valuePort;
        return null;
      })
      .filter((port): port is number => typeof port === 'number');

    return Array.from(new Set(parsed)).sort((a, b) => a - b);
  };

  useEffect(() => {
    if (!isOpen) {
      modalSessionRef.current = { wasOpen: false, gameKey: null };
      return;
    }

    const shouldInitialize =
      !modalSessionRef.current.wasOpen || modalSessionRef.current.gameKey !== gameKey;
    if (!shouldInitialize) return;

    const defaultTcpList = normalizePortList(portsDefinition?.tcp);
    const defaultUdpList = normalizePortList(portsDefinition?.udp);

    const nextTcpRows = initialConfig?.ports?.tcp
      ? Object.entries(initialConfig.ports.tcp).map(([hostPort, containerPort]) =>
          createPortRow(
            hostPort,
            containerPort,
            initialConfig?.portLabels?.tcp?.[hostPort] ??
              portsDefinition?.tcp?.[hostPort] ??
              ''
          )
        )
      : defaultTcpList.map((containerPort) =>
          createPortRow(
            containerPort,
            containerPort,
            portsDefinition?.tcp?.[String(containerPort)] ?? ''
          )
        );
    setTcpRows(nextTcpRows);

    const nextUdpRows = initialConfig?.ports?.udp
      ? Object.entries(initialConfig.ports.udp).map(([hostPort, containerPort]) =>
          createPortRow(
            hostPort,
            containerPort,
            initialConfig?.portLabels?.udp?.[hostPort] ??
              portsDefinition?.udp?.[hostPort] ??
              ''
          )
        )
      : defaultUdpList.map((containerPort) =>
          createPortRow(
            containerPort,
            containerPort,
            portsDefinition?.udp?.[String(containerPort)] ?? ''
          )
        );
    setUdpRows(nextUdpRows);

    const usedTcpOnOpen = new Set((usedPorts?.tcp || []).map((p) => Number(p)));
    const usedUdpOnOpen = new Set((usedPorts?.udp || []).map((p) => Number(p)));
    const hasTcpConflict = nextTcpRows.some((row) => usedTcpOnOpen.has(Number(row.hostPort)));
    const hasUdpConflict = nextUdpRows.some((row) => usedUdpOnOpen.has(Number(row.hostPort)));
    setShowPorts(hasTcpConflict || hasUdpConflict);

    const firstContainerTcp = nextTcpRows
      .map((row) => Number(row.containerPort))
      .find((port) => Number.isInteger(port));
    const initialHealthcheck = initialConfig?.healthcheck ?? healthcheck ?? null;

    if (initialHealthcheck?.type === 'tcp_connect') {
      const tcpPort = Number(initialHealthcheck.port);
      if (Number.isInteger(tcpPort) && tcpPort >= 1 && tcpPort <= 65535) {
        setHealthcheckType('tcp_connect');
        setHealthcheckPort(String(tcpPort));
      } else if (firstContainerTcp !== undefined) {
        setHealthcheckType('tcp_connect');
        setHealthcheckPort(String(Number(firstContainerTcp)));
      } else {
        setHealthcheckType('default');
        setHealthcheckPort('');
      }
      setHealthcheckProcess('');
    } else if (initialHealthcheck?.type === 'process') {
      const processName =
        typeof initialHealthcheck.name === 'string' ? initialHealthcheck.name.trim() : '';
      if (processName) {
        setHealthcheckType('process');
        setHealthcheckProcess(processName);
      } else {
        setHealthcheckType('default');
        setHealthcheckProcess('');
      }
      setHealthcheckPort('');
    } else {
      setHealthcheckType('default');
      setHealthcheckPort('');
      setHealthcheckProcess('');
    }
    setShowHealthcheckAdvanced(false);

    setServerName(
      initialConfig?.serverName?.trim() ? initialConfig.serverName.trim() : `${gameName} Server`
    );
    setSteamUsername(initialConfig?.steamUsername?.trim() ? initialConfig.steamUsername.trim() : '');
    setSteamPassword('');
    setValidationError(null);
    modalSessionRef.current = { wasOpen: true, gameKey };
  }, [isOpen, gameKey, gameName, portsDefinition, initialConfig, usedPorts, healthcheck]);

  const usedTcpPorts = new Set(
    (usedPorts?.tcp || []).map((p) => Number(p)).filter((p) => Number.isInteger(p))
  );
  const usedUdpPorts = new Set(
    (usedPorts?.udp || []).map((p) => Number(p)).filter((p) => Number.isInteger(p))
  );

  const conflictingTcpPorts = useMemo(() => {
    const counts = new Map<number, number>();
    tcpRows.forEach((row) => {
      const port = Number(row.hostPort);
      if (!Number.isInteger(port)) return;
      counts.set(port, (counts.get(port) ?? 0) + 1);
    });

    const next = new Set<number>(usedTcpPorts);
    counts.forEach((count, port) => {
      if (count > 1) next.add(port);
    });
    return next;
  }, [tcpRows, usedTcpPorts]);

  const conflictingUdpPorts = useMemo(() => {
    const counts = new Map<number, number>();
    udpRows.forEach((row) => {
      const port = Number(row.hostPort);
      if (!Number.isInteger(port)) return;
      counts.set(port, (counts.get(port) ?? 0) + 1);
    });

    const next = new Set<number>(usedUdpPorts);
    counts.forEach((count, port) => {
      if (count > 1) next.add(port);
    });
    return next;
  }, [udpRows, usedUdpPorts]);

  const usedServerNameSet = new Set(
    (usedServerNames || []).map((name) => name.trim().toLowerCase()).filter(Boolean)
  );
  const isServerNameTaken =
    serverName.trim().length > 0 && usedServerNameSet.has(serverName.trim().toLowerCase());

  const findNextPort = (
    existingHostPorts: Set<number>,
    usedHostPorts: Set<number>,
    start: number
  ) => {
    for (let port = start; port <= 65535; port += 1) {
      if (!existingHostPorts.has(port) && !usedHostPorts.has(port)) return port;
    }
    for (let port = 1024; port < start; port += 1) {
      if (!existingHostPorts.has(port) && !usedHostPorts.has(port)) return port;
    }
    return null;
  };

  const addTcpPort = () => {
    const existingHostPorts = new Set(
      tcpRows.map((row) => Number(row.hostPort)).filter((port) => Number.isInteger(port))
    );
    const nextHostPort = findNextPort(existingHostPorts, usedTcpPorts, 25565);
    if (!nextHostPort) return;
    setTcpRows((prev) => [...prev, createPortRow(nextHostPort, nextHostPort)]);
    setShowPorts(true);
  };

  const addUdpPort = () => {
    const existingHostPorts = new Set(
      udpRows.map((row) => Number(row.hostPort)).filter((port) => Number.isInteger(port))
    );
    const nextHostPort = findNextPort(existingHostPorts, usedUdpPorts, 27015);
    if (!nextHostPort) return;
    setUdpRows((prev) => [...prev, createPortRow(nextHostPort, nextHostPort)]);
    setShowPorts(true);
  };

  const handleConfirm = () => {
    setValidationError(null);

    if (!serverName.trim()) {
      setValidationError('Server name is required');
      return;
    }

    if (!gameServerName?.trim()) {
      setValidationError('Game server definition is missing (gameServerName)');
      return;
    }

    if (isServerNameTaken) {
      setValidationError('Server name is already used');
      return;
    }

    if (requireSteamCredentials) {
      if (!steamUsername.trim() || !steamPassword.trim()) {
        setValidationError(
          'Steam credentials are required: please provide steamUsername and steamPassword.'
        );
        return;
      }
    }

    const tcpHostPorts = tcpRows.map((row) => parseInt(row.hostPort, 10));
    if (tcpHostPorts.some((p) => !Number.isInteger(p) || p < 1024 || p > 65535)) {
      setValidationError('All port numbers must be between 1024 and 65535');
      return;
    }
    const tcpContainerPorts = tcpRows.map((row) => Number(row.containerPort));
    if (tcpContainerPorts.some((p) => !Number.isInteger(p) || p < 1024 || p > 65535)) {
      setValidationError('All container port numbers must be between 1024 and 65535');
      return;
    }

    const udpHostPorts = udpRows.map((row) => parseInt(row.hostPort, 10));
    if (udpHostPorts.some((p) => !Number.isInteger(p) || p < 1024 || p > 65535)) {
      setValidationError('All port numbers must be between 1024 and 65535');
      return;
    }
    const udpContainerPorts = udpRows.map((row) => Number(row.containerPort));
    if (udpContainerPorts.some((p) => !Number.isInteger(p) || p < 1024 || p > 65535)) {
      setValidationError('All container port numbers must be between 1024 and 65535');
      return;
    }

    const uniqueTcp = new Set(tcpHostPorts);
    if (uniqueTcp.size !== tcpHostPorts.length) {
      setValidationError('TCP port numbers must be unique');
      return;
    }
    const uniqueUdp = new Set(udpHostPorts);
    if (uniqueUdp.size !== udpHostPorts.length) {
      setValidationError('UDP port numbers must be unique');
      return;
    }

    const usedTcpCollisions = tcpHostPorts.filter((port) => usedTcpPorts.has(port));
    if (usedTcpCollisions.length > 0) {
      setValidationError(
        `TCP port(s) already used: ${Array.from(new Set(usedTcpCollisions)).join(', ')}`
      );
      return;
    }

    const usedUdpCollisions = udpHostPorts.filter((port) => usedUdpPorts.has(port));
    if (usedUdpCollisions.length > 0) {
      setValidationError(
        `UDP port(s) already used: ${Array.from(new Set(usedUdpCollisions)).join(', ')}`
      );
      return;
    }

    const normalizedTcpPortLabels: Record<string, string> = {};
    const tcpPortsPayload: Record<string, number> = {};
    tcpRows.forEach((row) => {
      const hostKey = String(parseInt(row.hostPort, 10));
      tcpPortsPayload[hostKey] = Number(row.containerPort);
      normalizedTcpPortLabels[hostKey] = normalizePortLabel(row.label);
    });

    const normalizedUdpPortLabels: Record<string, string> = {};
    const udpPortsPayload: Record<string, number> = {};
    udpRows.forEach((row) => {
      const hostKey = String(parseInt(row.hostPort, 10));
      udpPortsPayload[hostKey] = Number(row.containerPort);
      normalizedUdpPortLabels[hostKey] = normalizePortLabel(row.label);
    });

    let resolvedHealthcheck: InstallHealthcheckPayload;
    if (healthcheckType === 'tcp_connect') {
      const tcpPort = Number(healthcheckPort);
      if (!Number.isInteger(tcpPort) || tcpPort < 1 || tcpPort > 65535) {
        setValidationError('Healthcheck TCP port must be between 1 and 65535');
        return;
      }
      resolvedHealthcheck = { type: 'tcp_connect', port: tcpPort };
    } else if (healthcheckType === 'process') {
      const processName = healthcheckProcess.trim();
      if (!processName) {
        setValidationError('Healthcheck process name is required');
        return;
      }
      resolvedHealthcheck = { type: 'process', name: processName };
    } else {
      resolvedHealthcheck = { type: 'default' };
    }

    onConfirm({
      serverName: serverName.trim(),
      gameServerName: gameServerName.trim(),
      ...(requireSteamCredentials
        ? {
            requireSteamCredentials: true,
            steamUsername: steamUsername.trim(),
            steamPassword,
          }
        : {}),
      ports: {
        tcp: tcpPortsPayload,
        udp: udpPortsPayload,
      },
      portLabels: {
        tcp: normalizedTcpPortLabels,
        udp: normalizedUdpPortLabels,
      },
      healthcheck: resolvedHealthcheck,
    });
  };

  const handleTcpHostPortChange = (rowId: string, value: string) => {
    setTcpRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, hostPort: value } : row))
    );
  };

  const handleTcpContainerPortChange = (rowId: string, value: string) => {
    setTcpRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, containerPort: value } : row))
    );
  };

  const handleUdpHostPortChange = (rowId: string, value: string) => {
    setUdpRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, hostPort: value } : row))
    );
  };

  const handleUdpContainerPortChange = (rowId: string, value: string) => {
    setUdpRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, containerPort: value } : row))
    );
  };

  const removeTcpPort = (rowId: string) => {
    setTcpRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const removeUdpPort = (rowId: string) => {
    setUdpRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const handleTcpPortLabelChange = (rowId: string, value: string) => {
    setTcpRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, label: normalizePortLabel(value) } : row))
    );
  };

  const handleUdpPortLabelChange = (rowId: string, value: string) => {
    setUdpRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, label: normalizePortLabel(value) } : row))
    );
  };

  if (!isOpen) return null;

  const overlayBg = hideBackdrop ? 'bg-transparent' : 'bg-black/60 backdrop-blur-sm';
  const modalBg = 'bg-gradient-to-br from-[#1f2937] to-[#111827]';
  const borderColor = 'border-gray-700/50';
  const textPrimary = 'text-white';
  const textSecondary = 'text-gray-400';
  const inputBg = 'bg-[#0f1723]/60 backdrop-blur-sm';
  const inputBorder = 'border-gray-700/50';
  const inputFocus = 'focus:ring-2 focus:ring-[var(--color-cyan-400)] focus:border-transparent';
  const buttonPrimary =
    'bg-gradient-to-r from-[#0050D7] to-[#157EEA] hover:from-[#157EEA] hover:to-[var(--color-cyan-400)] hover:text-white shadow-lg hover:shadow-[#0050D7]/50';
  const buttonSecondary =
    'bg-gray-700/50 hover:bg-gray-600/60 border border-gray-600/50 text-white';
  const collapseBg = 'bg-[#0f1723]/60 hover:bg-[#1f2937]/60 border-b border-gray-700/30';
  const tagBg = 'bg-[#0050D7]/20 text-[var(--color-cyan-400)] border border-[var(--color-cyan-400)]/50';
  const totalPorts = tcpRows.length + udpRows.length;

  return (
    <div className={`fixed inset-0 ${overlayBg} flex items-center justify-center z-[90] p-4`}>
      <div
        className={`${modalBg} rounded-2xl border ${borderColor} shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto`}
      >
        <div className={`px-6 py-5 border-b ${borderColor}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className={`text-2xl font-bold ${textPrimary} mb-1`}>Install {gameName}</h2>
              <p className={`text-sm ${textSecondary}`}>Configure your server</p>
            </div>
            <AppButton
              onClick={onCancel}
              className="p-2 rounded-lg transition-all hover:bg-gray-700/50"
              disabled={isLoading}
            >
              <X className={`w-5 h-5 ${textSecondary}`} />
            </AppButton>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          {(validationError || error) && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/15 border border-red-500/30">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
              <p className="text-sm leading-relaxed text-red-300/90">{validationError || error}</p>
            </div>
          )}

          <div>
            <label
              className={`block text-sm font-semibold ${textPrimary} mb-2.5 flex items-center gap-2`}
            >
              <Server className="w-4 h-4" />
              Server Name
            </label>
            <AppInput
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              disabled={isLoading}
              className={`w-full px-4 py-3 ${inputBg} border ${inputBorder} rounded-xl ${textPrimary} placeholder:${textSecondary} ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
              placeholder={`${gameName} Server`}
            />
            {isServerNameTaken && (
              <p className="mt-2 text-xs font-semibold text-red-400">Already used</p>
            )}
          </div>

          {requireSteamCredentials && (
            <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-4 space-y-3">
              <p className="text-xs leading-relaxed text-amber-100/90">
                It is strongly recommended to create a dedicated Steam account for this purpose
                (recommended by LinuxGSM).{' '}
                <a
                  href="https://docs.linuxgsm.com/steamcmd"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-cyan-400)] underline underline-offset-2 hover:text-[var(--color-cyan-400)]"
                >
                  SteamCMD | LinuxGSM_
                </a>
              </p>
              <p className="text-xs leading-relaxed text-amber-100/90">
                It is strongly recommended to use a complex password and disable email-based
                two-factor authentication.
              </p>
              <ol className="list-decimal pl-4 space-y-1 text-xs leading-relaxed text-amber-100/80">
                <li>Open Steam.</li>
                <li>At the top left, click Steam, then Settings.</li>
                <li>Go to Account.</li>
                <li>Click Manage Steam Guard Account Security.</li>
                <li>Select Turn Steam Guard off, then Continue.</li>
                <li>Confirm using the link sent by email.</li>
              </ol>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider ${textSecondary} mb-2`}>
                    Steam Username
                  </label>
                  <AppInput
                    type="text"
                    value={steamUsername}
                    onChange={(e) => setSteamUsername(e.target.value)}
                    disabled={isLoading}
                    autoComplete="off"
                    placeholder="steam_username"
                    className={`w-full px-4 py-3 ${inputBg} border ${inputBorder} rounded-xl ${textPrimary} placeholder:${textSecondary} ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider ${textSecondary} mb-2`}>
                    Steam Password
                  </label>
                  <AppInput
                    type="password"
                    value={steamPassword}
                    onChange={(e) => setSteamPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="new-password"
                    placeholder="••••••••••"
                    className={`w-full px-4 py-3 ${inputBg} border ${inputBorder} rounded-xl ${textPrimary} placeholder:${textSecondary} ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
                  />
                </div>
              </div>
            </div>
          )}

          <PortsSection
            borderColor={borderColor}
            collapseBg={collapseBg}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            inputBg={inputBg}
            inputBorder={inputBorder}
            inputFocus={inputFocus}
            tagBg={tagBg}
            showPorts={showPorts}
            setShowPorts={setShowPorts}
            totalPorts={totalPorts}
            isLoading={isLoading}
            addTcpPort={addTcpPort}
            addUdpPort={addUdpPort}
            tcpRows={tcpRows}
            udpRows={udpRows}
            usedTcpPorts={conflictingTcpPorts}
            usedUdpPorts={conflictingUdpPorts}
            handleTcpHostPortChange={handleTcpHostPortChange}
            handleTcpContainerPortChange={handleTcpContainerPortChange}
            handleUdpHostPortChange={handleUdpHostPortChange}
            handleUdpContainerPortChange={handleUdpContainerPortChange}
            handleTcpPortLabelChange={handleTcpPortLabelChange}
            handleUdpPortLabelChange={handleUdpPortLabelChange}
            removeTcpPort={removeTcpPort}
            removeUdpPort={removeUdpPort}
          />

          <AdvancedSection
            borderColor={borderColor}
            collapseBg={collapseBg}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            inputBg={inputBg}
            inputBorder={inputBorder}
            inputFocus={inputFocus}
            showHealthcheckAdvanced={showHealthcheckAdvanced}
            setShowHealthcheckAdvanced={setShowHealthcheckAdvanced}
            isLoading={isLoading}
            dockerImage={dockerImage}
            healthcheckType={healthcheckType}
            setHealthcheckType={setHealthcheckType}
            healthcheckPort={healthcheckPort}
            setHealthcheckPort={setHealthcheckPort}
            healthcheckProcess={healthcheckProcess}
            setHealthcheckProcess={setHealthcheckProcess}
          />
        </div>

        <div className={`flex gap-3 px-6 py-4 border-t ${borderColor}`}>
          <AppButton
            onClick={onCancel}
            disabled={isLoading}
            className={`flex-1 px-4 py-2.5 ${buttonSecondary} rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Cancel
          </AppButton>
          <AppButton
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2.5 ${buttonPrimary} text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isLoading ? 'Installing...' : 'Install'}
          </AppButton>
        </div>
      </div>
    </div>
  );
}



