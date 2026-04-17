import { AppBadge } from './AppBadge';
import { cn } from '../utils/cn';

export type AppStatusTone =
  | 'online'
  | 'offline'
  | 'starting'
  | 'stopping'
  | 'restarting'
  | 'healthy'
  | 'degraded'
  | 'error'
  | 'success'
  | 'warning'
  | 'critical'
  | 'info'
  | 'enabled'
  | 'disabled';

const toneClassMap: Record<AppStatusTone, { badgeTone: 'success' | 'neutral' | 'warning' | 'critical' | '07' }> =
  {
    online: { badgeTone: 'success' },
    offline: { badgeTone: 'neutral' },
    starting: { badgeTone: '07' },
    stopping: { badgeTone: 'warning' },
    restarting: { badgeTone: '07' },
    healthy: { badgeTone: 'success' },
    degraded: { badgeTone: 'warning' },
    error: { badgeTone: 'critical' },
    success: { badgeTone: 'success' },
    warning: { badgeTone: 'warning' },
    critical: { badgeTone: 'critical' },
    info: { badgeTone: '07' },
    enabled: { badgeTone: 'success' },
    disabled: { badgeTone: 'neutral' },
  };

interface AppStatusBadgeProps {
  className?: string;
  label: string;
  tone: AppStatusTone;
}

export function AppStatusBadge({ className, label, tone }: AppStatusBadgeProps) {
  const { badgeTone } = toneClassMap[tone];
  return (
    <AppBadge className={cn('gp-status-badge', `gp-status-badge--${tone}`, className)} tone={badgeTone}>
      {label}
    </AppBadge>
  );
}
