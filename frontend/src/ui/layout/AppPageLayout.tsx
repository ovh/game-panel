import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

interface AppPageLayoutProps {
  children: ReactNode;
  className?: string;
}

export function AppPageLayout({ children, className }: AppPageLayoutProps) {
  return (
    <section
      className={cn(
        'gp-page-layout w-full px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6',
        className
      )}
    >
      {children}
    </section>
  );
}
