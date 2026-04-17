import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

export interface AppToggleProps {
  ariaLabel?: string;
  checked: boolean;
  className?: string;
  disabled?: boolean;
  label?: ReactNode;
  onChange?: (checked: boolean) => void;
  size?: 'standard' | 'compact';
}

export function AppToggle({
  ariaLabel,
  checked,
  className,
  disabled = false,
  label,
  onChange,
  size = 'standard',
}: AppToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-ods="toggle"
      data-disabled={disabled ? '' : undefined}
      tabIndex={disabled ? -1 : undefined}
      className={cn(
        'gp-app-toggle',
        size === 'compact' ? 'gp-app-toggle--compact' : 'gp-app-toggle--standard',
        className
      )}
      onClick={() => {
        if (disabled) return;
        onChange?.(!checked);
      }}
    >
      <span
        aria-hidden="true"
        data-ods="toggle-control"
        data-state={checked ? 'checked' : 'unchecked'}
        data-disabled={disabled ? '' : undefined}
        className="gp-app-toggle-control"
      >
        <span className="gp-app-toggle-thumb" />
      </span>
      {label ? (
        <span data-ods="toggle-label" className="gp-app-toggle-label">
          {label}
        </span>
      ) : null}
    </button>
  );
}
