import { Card, type CardProp } from '@ovhcloud/ods-react';
import { cn } from '../utils/cn';

export interface AppCardProps extends CardProp {}

export function AppCard({ className, ...props }: AppCardProps) {
  return <Card className={cn('gp-app-card block w-full rounded-xl', className)} {...props} />;
}
