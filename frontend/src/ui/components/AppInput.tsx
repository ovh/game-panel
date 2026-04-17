import { forwardRef } from 'react';
import { Input, type InputProp } from '@ovhcloud/ods-react';
import { cn } from '../utils/cn';

export interface AppInputProps extends InputProp {}

export const AppInput = forwardRef<HTMLInputElement, AppInputProps>(function AppInput(
  { className, ...props },
  ref
) {
  return <Input ref={ref} className={cn('gp-app-input', className)} {...props} />;
});
