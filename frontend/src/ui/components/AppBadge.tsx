import { Badge, type BadgeColor, type BadgeProp } from '@ovhcloud/ods-react';
import { cn } from '../utils/cn';

export interface AppBadgeProps extends Omit<BadgeProp, 'color'> {
  tone?: BadgeColor | '07';
}

export function AppBadge({ className, tone = 'neutral', ...props }: AppBadgeProps) {
  const resolvedTone = tone === '07' ? 'information' : tone;

  return (
    <Badge
      color={resolvedTone}
      className={cn('gp-app-badge', tone === '07' && 'gp-app-badge--07', className)}
      {...props}
    />
  );
}
