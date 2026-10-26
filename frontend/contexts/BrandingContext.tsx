import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { apiClient } from '../utils/api';
import { adminApi, type PanelTheme } from '../utils/adminApi';
import { useTheme } from './ThemeContext';

// Custom panel name (set by an admin) shown instead of the "OVHcloud Game Panel" logo.
const DEFAULT_TITLE = 'OVHcloud Game Panel';

interface BrandingContextValue {
  name: string | null;
  saveName: (name: string) => Promise<void>;
  // Admin → Panel → Look: theme of visitors who have not picked one, line under the login form
  defaultTheme: PanelTheme;
  loginFooter: string;
  setAppearance: (patch: { defaultTheme?: PanelTheme; loginFooter?: string }) => Promise<void>;
}

type BrandingData = { name: string | null; defaultTheme?: PanelTheme; loginFooter?: string };

const BrandingContext = createContext<BrandingContextValue>({
  name: null,
  saveName: async () => {},
  defaultTheme: 'orange',
  loginFooter: '',
  setAppearance: async () => {},
});

export function usePanelName() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  const [defaultTheme, setDefaultTheme] = useState<PanelTheme>('orange');
  const [loginFooter, setLoginFooter] = useState('');
  const { applyDefaultTheme } = useTheme();

  useEffect(() => {
    apiClient
      .getBranding()
      .then((raw) => {
        const data = raw as BrandingData;
        setName(data?.name ?? null);
        setDefaultTheme(data?.defaultTheme ?? 'orange');
        setLoginFooter(data?.loginFooter ?? '');
        applyDefaultTheme(data?.defaultTheme ?? 'orange');
      })
      .catch(() => setName(null));
  }, [applyDefaultTheme]);

  useEffect(() => {
    document.title = name || DEFAULT_TITLE;
  }, [name]);

  const saveName = useCallback(async (next: string) => {
    const data = await apiClient.setBranding(next);
    setName(data?.name ?? null);
  }, []);

  const setAppearance = useCallback(async (patch: { defaultTheme?: PanelTheme; loginFooter?: string }) => {
    const data = await adminApi.saveAppearance(patch);
    setDefaultTheme(data.defaultTheme);
    setLoginFooter(data.loginFooter);
  }, []);

  return (
    <BrandingContext.Provider value={{ name, saveName, defaultTheme, loginFooter, setAppearance }}>{children}</BrandingContext.Provider>
  );
}

/** The panel's logo, or its custom name as text when an admin has set one. */
export function PanelLogo({
  imgClassName,
  textClassName = '',
  imgStyle,
  onClick,
}: {
  imgClassName: string;
  textClassName?: string;
  imgStyle?: CSSProperties;
  onClick?: () => void;
}) {
  const { name } = usePanelName();
  if (name) {
    return (
      <span
        className={`gp-panel-name block select-none truncate text-center font-bold tracking-tight text-white ${onClick ? 'cursor-pointer' : ''} ${textClassName}`}
        title={name}
        onClick={onClick}
      >
        {name}
      </span>
    );
  }
  return (
    <img
      src="/OVHcloud_Game_Panel_Logo.png"
      alt={DEFAULT_TITLE}
      draggable={false}
      className={imgClassName}
      style={imgStyle}
      onClick={onClick}
    />
  );
}
