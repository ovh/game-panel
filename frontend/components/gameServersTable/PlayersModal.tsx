import { useEffect, useMemo, useState } from 'react';
import { Search, Users, X } from 'lucide-react';
import type { ServerPlayers } from '../../types/gameServer';
import { formatPlayerCount } from './utils';

// Below this many players a search box is more clutter than help.
const SEARCH_THRESHOLD = 8;

interface PlayersModalProps {
  open: boolean;
  onClose: () => void;
  serverName: string;
  players: ServerPlayers | null;
}

export function PlayersModal({ open, onClose, serverName, players }: PlayersModalProps) {
  const [query, setQuery] = useState('');

  // The component stays mounted between openings, so the previous search must not leak.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const rawNames = players?.names ?? null;

  // Games return players in join order; alphabetical is what you need to find someone.
  // `numeric` keeps Player2 before Player10, `base` keeps case and accents from scattering.
  const sorted = useMemo(
    () =>
      rawNames
        ? [...rawNames].sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
          )
        : [],
    [rawNames]
  );

  const trimmed = query.trim().toLowerCase();
  const visible = trimmed ? sorted.filter((name) => name.toLowerCase().includes(trimmed)) : sorted;

  if (!open) return null;

  // Some games only return a partial list, so the reader must not assume they see everyone.
  const partial = typeof players?.online === 'number' && sorted.length < players.online;
  const showSearch = sorted.length >= SEARCH_THRESHOLD;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Online players"
        className="w-full max-w-sm rounded-lg border border-gray-800 bg-gp-surface-card shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-800 p-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <Users className="h-4 w-4 text-[var(--color-cyan-400)]" />
              Players
              <span className="text-sm font-semibold text-gray-400">{formatPlayerCount(players)}</span>
            </h2>
            <p className="mt-0.5 truncate text-xs text-gray-400">{serverName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700/60"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {showSearch && (
          <div className="border-b border-gray-800 px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search a player..."
                aria-label="Search a player"
                className="w-full rounded-lg border border-gray-700 bg-gp-surface-input py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:border-[var(--color-cyan-400)] focus:outline-none"
              />
            </div>
          </div>
        )}

        <div className="max-h-[50vh] overflow-y-auto p-4">
          {sorted.length === 0 ? (
            <p className="text-sm text-gray-400">No names reported.</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-gray-400">No player matches "{query.trim()}".</p>
          ) : (
            <ul className="space-y-1.5">
              {visible.map((name, i) => (
                <li
                  key={`${name}-${i}`}
                  className="truncate rounded-md border border-gray-800 bg-gray-900/30 px-3 py-2 text-sm text-white"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
          {partial && (
            <p className="mt-3 text-xs text-gray-500">
              {sorted.length} of {players?.online} shown
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
