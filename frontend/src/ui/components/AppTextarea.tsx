import { forwardRef } from 'react';
import { Textarea, type TextareaProp } from '@ovhcloud/ods-react';
import { cn } from '../utils/cn';

export interface AppTextareaProps extends TextareaProp {}

export const AppTextarea = forwardRef<HTMLTextAreaElement, AppTextareaProps>(function AppTextarea(
  { className, ...props },
  ref
) {
  return <Textarea ref={ref} className={cn('gp-app-textarea', className)} {...props} />;
});
