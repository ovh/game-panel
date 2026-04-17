import { useMemo } from 'react';
import { Select, SelectContent, SelectControl, type SelectProp } from '@ovhcloud/ods-react';
import { cn } from '../utils/cn';

export interface AppSelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface AppSelectProps
  extends Omit<
    SelectProp,
    'className' | 'defaultValue' | 'items' | 'multiple' | 'onChange' | 'onValueChange' | 'value'
  > {
  className?: string;
  createPortal?: boolean;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  value?: string;
}

export function AppSelect({
  className,
  createPortal = false,
  defaultValue,
  onChange,
  options,
  placeholder,
  value,
  ...props
}: AppSelectProps) {
  const items = useMemo(
    () =>
      options.map((option) => ({
        disabled: option.disabled,
        label: option.label,
        value: option.value,
      })),
    [options]
  );

  return (
    <Select
      {...props}
      className={cn('gp-app-select', className)}
      fitControlWidth
      items={items}
      defaultValue={defaultValue ? [defaultValue] : undefined}
      value={value !== undefined ? [value] : undefined}
      onValueChange={({ value: nextValue }) => onChange?.(nextValue[0] ?? '')}
    >
      <SelectControl className="gp-app-select-control" placeholder={placeholder} />
      <SelectContent createPortal={createPortal} />
    </Select>
  );
}
