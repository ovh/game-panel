import type { CSSProperties } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface ProviderBadgeProps {
  provider?: string;
}

// OVH emblem SVG — path extracted from @ovhcloud/ods-react LogoEmblem, viewBox 0 0 53 32
function OvhEmblem({ isDark, style }: { isDark: boolean; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 53 32"
      xmlns="http://www.w3.org/2000/svg"
      fill={isDark ? '#ffffff' : '#0050D7'}
      style={{ height: 20, width: 'auto', display: 'block', ...style }}
      aria-label="OVHcloud"
    >
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        d="M49.0997 1.83051C54.4055 11.4576 53.3981 23.3898 46.6147 32H32.1748L36.6075 24.0678H30.7644L37.6821 11.7966H43.5924L49.0997 1.83051ZM20.6901 32H5.98156C2.42173 27.5692 0.426997 22.2408 0.0614314 16.8C0.0345892 16.4005 0.0165306 16.0004 0.00728085 15.6C-0.000481239 15.264 -0.0020401 14.9278 0.00261926 14.5916C0.00867182 14.1548 0.0252172 13.718 0.0522883 13.2815C0.0830303 12.7859 0.127346 12.2907 0.185284 11.7966C0.591502 8.33228 1.66734 4.9199 3.4294 1.76271L12.9664 18.4407L23.4437 0H38.8911L20.6901 32Z"
      />
    </svg>
  );
}

// Standalone logo without any slot container — use anywhere you need just the icon
export function ProviderLogo({ provider, height = 22 }: { provider?: string; height?: number }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  if (provider === 'ovhcloud') {
    return <OvhEmblem isDark={isDark} style={{ height, width: 'auto', flexShrink: 0 }} />;
  }
  if (provider === 'linuxgsm') {
    return (
      <img
        src={isDark ? '/LinuxGSM_colour_white_logo.svg' : '/LinuxGSM_colour_black_logo.svg'}
        alt="LinuxGSM"
        style={{ height, width: 'auto', flexShrink: 0 }}
      />
    );
  }
  if (provider === 'external') {
    return (
      <span style={{
        fontSize: Math.round(height * 0.55),
        fontWeight: 600,
        color: isDark ? '#9ca3af' : '#6b7280',
        border: `1px solid ${isDark ? '#6b7280' : '#9ca3af'}`,
        borderRadius: 4,
        padding: '1px 5px',
        letterSpacing: '0.04em',
        flexShrink: 0,
        lineHeight: 1.4,
      }}>
        External
      </span>
    );
  }
  return null;
}

// Fixed-width slot so server names always start at the same x position
const BADGE_SLOT = 36;

export function ProviderBadge({ provider }: ProviderBadgeProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const slot: CSSProperties = {
    width: BADGE_SLOT,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (provider === 'ovhcloud') {
    return (
      <div style={slot}>
        <OvhEmblem isDark={isDark} />
      </div>
    );
  }

  if (provider === 'linuxgsm') {
    return (
      <div style={slot}>
        <img
          src={isDark ? '/LinuxGSM_colour_white_logo.svg' : '/LinuxGSM_colour_black_logo.svg'}
          alt="LinuxGSM"
          style={{ height: 28, width: 'auto', maxWidth: BADGE_SLOT }}
        />
      </div>
    );
  }

  if (provider === 'external') {
    return (
      <div style={slot}>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: isDark ? '#9ca3af' : '#6b7280',
          border: `1px solid ${isDark ? '#6b7280' : '#9ca3af'}`,
          borderRadius: 3,
          padding: '1px 4px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: 1.4,
        }}>
          Ext
        </span>
      </div>
    );
  }

  return null;
}
