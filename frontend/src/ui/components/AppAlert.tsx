import type { ReactNode } from 'react';
import { Message, MessageBody, type MessageProp } from '@ovhcloud/ods-react';
import { cn } from '../utils/cn';

export type AppAlertTone = 'info' | 'success' | 'warning' | 'critical';

const toneMap: Record<AppAlertTone, MessageProp['color']> = {
  info: 'information',
  success: 'success',
  warning: 'warning',
  critical: 'critical',
};

interface AppAlertProps extends Omit<MessageProp, 'color' | 'children'> {
  children: ReactNode;
  tone?: AppAlertTone;
}

export function AppAlert({
  className,
  children,
  dismissible = false,
  tone = 'info',
  ...props
}: AppAlertProps) {
  return (
    <Message
      color={toneMap[tone]}
      className={cn('gp-app-alert block w-full', `gp-app-alert--${tone}`, className)}
      dismissible={dismissible}
      {...props}
    >
      <MessageBody>{children}</MessageBody>
    </Message>
  );
}
