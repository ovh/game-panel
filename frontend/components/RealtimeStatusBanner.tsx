import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient, type RealtimeConnectionStatus } from '../utils/api';

/**
 * Self-contained banner that surfaces a lost realtime connection. It subscribes to
 * the WebSocket gateway's status (no prop drilling) and only appears while the
 * gateway is actively retrying, so operators know the live data is stale instead of
 * silently seeing frozen metrics/logs. Intentional disconnects ('closed', e.g. logout)
 * are not shown.
 */
export function RealtimeStatusBanner() {
  const [status, setStatus] = useState<RealtimeConnectionStatus>(() =>
    apiClient.getConnectionStatus()
  );

  useEffect(() => apiClient.onConnectionStatusChange(setStatus), []);

  if (status !== 'reconnecting') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-500/95 px-4 py-1.5 text-xs font-medium text-amber-950 shadow"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>Realtime connection lost — reconnecting… Displayed data may be out of date.</span>
    </div>
  );
}
