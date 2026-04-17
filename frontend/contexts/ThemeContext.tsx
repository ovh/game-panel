import { type ReactNode, useEffect } from 'react';

const THEME = 'dark' as const;

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    localStorage.setItem('theme', THEME);
  }, []);

  return <>{children}</>;
}
