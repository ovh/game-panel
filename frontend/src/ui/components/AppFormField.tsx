import type { ReactNode } from 'react';
import {
  FormField,
  FormFieldError,
  FormFieldHelper,
  FormFieldLabel,
  type FormFieldProp,
} from '@ovhcloud/ods-react';
import { cn } from '../utils/cn';

interface AppFormFieldProps extends Omit<FormFieldProp, 'children'> {
  children: ReactNode;
  error?: string;
  helper?: string;
  label: string;
  required?: boolean;
}

export function AppFormField({
  children,
  className,
  error,
  helper,
  label,
  required = false,
  ...props
}: AppFormFieldProps) {
  return (
    <FormField className={cn('gp-app-form-field flex flex-col gap-2', className)} invalid={Boolean(error)} {...props}>
      <FormFieldLabel>{required ? `${label} (Mandatory)` : label}</FormFieldLabel>
      {children}
      {helper ? <FormFieldHelper>{helper}</FormFieldHelper> : null}
      {error ? <FormFieldError>{error}</FormFieldError> : null}
    </FormField>
  );
}
