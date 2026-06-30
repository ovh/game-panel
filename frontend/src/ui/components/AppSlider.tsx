import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export interface AppSliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export const AppSlider = forwardRef<HTMLInputElement, AppSliderProps>(function AppSlider(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type="range"
      className={cn('gp-game-config-range w-full', className)}
      {...props}
    />
  );
});
