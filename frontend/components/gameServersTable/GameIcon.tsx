import type { GameServer } from '../../types/gameServer';

// small game icon left of the server name (for now Call of Duty 4: a "4" in a sight)
export function isCod4(server: Pick<GameServer, 'game' | 'catalogId'>): boolean {
  return server.catalogId === 'cod4' || /^cod4/i.test(server.game ?? '');
}

export function Cod4Icon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} role="img" aria-label="Call of Duty 4">
      <defs>
        <linearGradient id="gp-cod4-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3f2a" />
          <stop offset="1" stopColor="#14160e" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="6" fill="url(#gp-cod4-bg)" stroke="#8a8f5c" strokeWidth="1" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#c9cf8f" strokeOpacity="0.55" strokeWidth="1.2" />
      <path d="M16 2.5v5M16 24.5v5M2.5 16h5M24.5 16h5" stroke="#c9cf8f" strokeOpacity="0.55" strokeWidth="1.2" />
      <text
        x="16"
        y="21.6"
        textAnchor="middle"
        fontFamily="Impact, 'Arial Black', 'Helvetica Neue', sans-serif"
        fontSize="16"
        fontWeight="900"
        fill="#f4f1e1"
      >
        4
      </text>
    </svg>
  );
}

export function GameIcon({ server, className }: { server: Pick<GameServer, 'game' | 'catalogId'>; className?: string }) {
  return isCod4(server) ? <Cod4Icon className={className} /> : null;
}
