import { useEffect, useRef } from 'react';

export function useInstallAutoOpenLogs(
  installServerId: number | null,
  installStatus: string | null,
  openInstallLogs: (serverId: number) => void
) {
  const autoOpenedInstallLogsRef = useRef<number | null>(null);

  useEffect(() => {
    if (installServerId === null) {
      autoOpenedInstallLogsRef.current = null;
      return;
    }

    if (installStatus === 'failed') return;
    if (autoOpenedInstallLogsRef.current === installServerId) return;

    openInstallLogs(installServerId);
    autoOpenedInstallLogsRef.current = installServerId;
  }, [installServerId, installStatus, openInstallLogs]);
}
