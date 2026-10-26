import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
// animated Neon theme on top of the dark theme, in two colour sets
export type NeonColor = 'off' | 'cyan' | 'orange';

interface ThemeContextValue {
  // 'dark' also while the neon theme is on
  theme: Theme;
  toggleTheme: () => void;
  neon: NeonColor;
  // off → cyan → orange → off
  toggleNeon: () => void;
  // the login page is always shown in the Neon theme (orange when Neon is off)
  setLoginScreen: (on: boolean) => void;
  // the panel's default theme (Admin → Panel → Look), used until this browser picks one
  applyDefaultTheme: (theme: DefaultTheme) => void;
}

export type DefaultTheme = 'orange' | 'cyan' | 'dark' | 'light';

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
  neon: 'off',
  toggleNeon: () => {},
  setLoginScreen: () => {},
  applyDefaultTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

// a theme picked in this browser (a theme button); until then the panel's default theme is used
function getInitialPicked(): boolean {
  if (localStorage.getItem('theme-picked') === '1') return true;
  // before the default theme existed, the choice was saved without this flag; orange Neon was the default then
  const neon = localStorage.getItem('theme-neon');
  return neon === 'off' || neon === 'cyan' || neon === '1';
}

function fromDefault(value: string | null): { theme: Theme; neon: NeonColor } {
  if (value === 'cyan') return { theme: 'dark', neon: 'cyan' };
  if (value === 'dark') return { theme: 'dark', neon: 'off' };
  if (value === 'light') return { theme: 'light', neon: 'off' };
  return { theme: 'dark', neon: 'orange' };
}

function getInitialTheme(): Theme {
  if (!getInitialPicked()) return fromDefault(localStorage.getItem('theme-default')).theme;
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return 'light';
}

function getInitialNeon(): NeonColor {
  if (!getInitialPicked()) return fromDefault(localStorage.getItem('theme-default')).neon;
  const stored = localStorage.getItem('theme-neon');
  if (stored === 'off') return 'off';
  return stored === '1' || stored === 'cyan' ? 'cyan' : 'orange';
}

const NEXT_NEON: Record<NeonColor, NeonColor> = { off: 'cyan', cyan: 'orange', orange: 'off' };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [neon, setNeon] = useState<NeonColor>(getInitialNeon);
  const [loginScreen, setLoginScreen] = useState(false);
  const [picked, setPicked] = useState<boolean>(getInitialPicked);
  // what is shown: the login page uses orange Neon when Neon is off; the saved choice stays as it is
  const shownNeon: NeonColor = neon === 'off' && loginScreen ? 'orange' : neon;
  const effectiveTheme: Theme = shownNeon !== 'off' ? 'dark' : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.classList.toggle('gp-neon', shownNeon !== 'off');
    root.classList.toggle('gp-neon-orange', shownNeon === 'orange');
    if (picked) {
      localStorage.setItem('theme', theme);
      localStorage.setItem('theme-neon', neon);
    }
  }, [effectiveTheme, theme, neon, shownNeon, picked]);

  const pick = () => {
    setPicked(true);
    localStorage.setItem('theme-picked', '1');
  };
  const applyDefaultTheme = useCallback(
    (value: DefaultTheme) => {
      // remembered for the next visit, so the page does not start in another theme
      localStorage.setItem('theme-default', value);
      if (picked) return;
      const next = fromDefault(value);
      setTheme(next.theme);
      setNeon(next.neon);
    },
    [picked]
  );

  const toggleTheme = () => {
    pick();
    // leaving dark (also from neon) goes to the light theme
    if (effectiveTheme === 'dark') {
      setNeon('off');
      setTheme('light');
    } else {
      setTheme('dark');
    }
  };
  const toggleNeon = () => {
    pick();
    setNeon((prev) => NEXT_NEON[prev]);
  };

  return (
    <ThemeContext.Provider value={{ theme: effectiveTheme, toggleTheme, neon, toggleNeon, setLoginScreen, applyDefaultTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
