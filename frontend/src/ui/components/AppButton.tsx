import { Button, type ButtonProp } from '@ovhcloud/ods-react';
import { cn } from '../utils/cn';

export type AppButtonTone = 'primary' | 'secondary' | 'neutral' | 'critical' | 'ghost';

interface AppButtonProps extends Omit<ButtonProp, 'color' | 'variant'> {
  tone?: AppButtonTone;
  fullWidth?: boolean;
}

const toneProps: Record<AppButtonTone, Pick<ButtonProp, 'color' | 'variant'>> = {
  primary: { color: 'primary', variant: 'default' },
  secondary: { color: 'information', variant: 'default' },
  neutral: { color: 'neutral', variant: 'outline' },
  critical: { color: 'critical', variant: 'default' },
  ghost: { color: 'primary', variant: 'ghost' },
};

export function AppButton({
  tone = 'neutral',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: AppButtonProps) {
  const resolved = toneProps[tone];

  return (
    <Button
      type={type}
      color={resolved.color}
      variant={resolved.variant}
      className={cn(
        'gp-app-button min-h-9 font-semibold transition-colors',
        `gp-app-button--${tone}`,
        fullWidth && 'w-full',
        className
      )}
      {...props}
    />
  );
}

export type { AppButtonProps };
