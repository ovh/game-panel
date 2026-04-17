import { memo, useMemo, useState } from 'react';
import { ChevronDown, FolderOpen, RefreshCw, Settings } from 'lucide-react';
import { AppButton } from '../../src/ui/components';

interface GameConfigAdvancedLinksProps {
  configFiles: string[];
  isLoading: boolean;
  error?: string | null;
  canReadFileManager: boolean;
  canWriteFileManager: boolean;
  onOpenFileManagerPath?: (path: string) => void;
}

type ConfigFormat = 'INI' | 'PROPERTIES' | 'JSON' | 'YAML' | 'CFG' | 'TXT' | 'LUA' | 'TOML' | 'UNKNOWN';

const contentBg = 'bg-[#111827]';
const borderColor = 'border-gray-700';
const textPrimary = 'text-white';
const textSecondary = 'text-gray-400';
const accentText = 'text-[var(--color-cyan-400)]';
const accentBorder = 'border-[var(--color-cyan-400)]/35';
const accentBg = 'bg-[#0050D7]/15';

const resolveConfigFormat = (path: string): ConfigFormat => {
  const extension = path.split('.').pop()?.toLowerCase();
  if (!extension) return 'UNKNOWN';

  if (extension === 'ini') return 'INI';
  if (extension === 'properties' || extension === 'prop') return 'PROPERTIES';
  if (extension === 'json' || extension === 'json5' || extension === 'jsonc') return 'JSON';
  if (extension === 'yaml' || extension === 'yml') return 'YAML';
  if (extension === 'lua') return 'LUA';
  if (extension === 'toml') return 'TOML';
  if (extension === 'cfg' || extension === 'conf' || extension === 'cnf') return 'CFG';
  if (extension === 'txt') return 'TXT';

  return 'UNKNOWN';
};

const getBadgeClass = (format: ConfigFormat) => {
  if (format === 'UNKNOWN') {
    return 'bg-gray-600/15 text-gray-300 border-gray-600/30';
  }

  if (format === 'JSON' || format === 'YAML') {
    return 'bg-[#0050D7]/12 text-[var(--color-cyan-400)] border-[var(--color-cyan-400)]/30';
  }

  if (format === 'LUA' || format === 'TOML') {
    return 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30';
  }

  if (format === 'CFG' || format === 'TXT') {
    return 'bg-[#0050D7]/18 text-[var(--color-cyan-400)] border-[var(--color-cyan-400)]/35';
  }

  if (format === 'PROPERTIES') {
    return 'bg-cyan-500/12 text-cyan-300 border-cyan-500/30';
  }

  switch (format) {
    case 'INI':
      return `${accentBg} ${accentText} ${accentBorder}`;
    default:
      return `${accentBg} ${accentText} ${accentBorder}`;
  }
};

function GameConfigAdvancedLinksComponent({
  configFiles,
  isLoading,
  error,
  canReadFileManager,
  canWriteFileManager,
  onOpenFileManagerPath,
}: GameConfigAdvancedLinksProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const mappedFiles = useMemo(
    () =>
      configFiles.map((path) => ({
        path,
        format: resolveConfigFormat(path),
      })),
    [configFiles]
  );

  return (
    <div className={`${contentBg} border ${borderColor} rounded-lg p-6 space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className={`text-lg font-semibold ${textPrimary} mb-1`}>Advanced Configuration</h4>
          <p className={`text-sm ${textSecondary}`}>Direct links to real configuration files.</p>
        </div>
        <AppButton
          onClick={() => setShowAdvanced((previous) => !previous)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors bg-[#1f2937] border border-gray-600 hover:border-[var(--color-cyan-400)]/50 hover:bg-[#27354b] text-white"
        >
          <Settings className="w-4 h-4" />
          <span>{showAdvanced ? 'Hide advanced' : 'Show advanced'}</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
          />
        </AppButton>
      </div>

      {showAdvanced && (
        <div className="space-y-3">
          {!canReadFileManager ? (
            <div className="text-sm text-red-300">
              Access denied. `fs.read` permission is required to open advanced config files.
            </div>
          ) : (
            <>
              {!canWriteFileManager && (
                <div className="text-xs text-amber-300">
                  Read-only access detected. You can open files, but saving edits in File Manager
                  requires `fs.write`.
                </div>
              )}

              {isLoading && (
                <div className={`flex items-center gap-2 text-sm ${textSecondary}`}>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading advanced config files...</span>
                </div>
              )}

              {error && <div className="text-sm text-amber-300">{error}</div>}

              {!isLoading && mappedFiles.length === 0 && (
                <p className={`text-sm ${textSecondary}`}>
                  No advanced config files detected for this game.
                </p>
              )}

              {!isLoading && mappedFiles.length > 0 && (
                <div className="space-y-2">
                  {mappedFiles.map(({ path, format }, index) => {
                    const canOpen = canReadFileManager && Boolean(onOpenFileManagerPath);
                    const hasSeparator = index < mappedFiles.length - 1;

                    return (
                      <div
                        key={path}
                        className={`flex flex-col gap-2 md:flex-row md:items-center md:justify-between py-2 ${
                          hasSeparator ? `border-b ${borderColor}` : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${getBadgeClass(format)}`}
                          >
                            {format}
                          </span>
                          <span className={`text-sm font-mono break-all ${textSecondary}`}>
                            {path}
                          </span>
                        </div>
                        <AppButton
                          onClick={() => onOpenFileManagerPath?.(path)}
                          disabled={!canOpen}
                          className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap ${
                            canOpen
                              ? 'bg-[#1f2937] border border-gray-600 hover:border-[var(--color-cyan-400)]/50 hover:bg-[#27354b] text-white'
                              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          <FolderOpen className="w-4 h-4" />
                          Open in File Manager
                        </AppButton>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const GameConfigAdvancedLinks = memo(GameConfigAdvancedLinksComponent);



