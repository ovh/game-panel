import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle, Wrench, X, ChevronDown, Disc } from 'lucide-react';
import { InstallationProgressModal } from './InstallationProgressModal';
import {
  InstallGameModal,
  type InstallHealthcheckPayload,
  type InstallRequestPayload,
} from './InstallGameModal';
import { apiClient } from '../utils/api';
import { AppButton } from '../src/ui/components';

interface InstallGameServerProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: (
    gameKey: string,
    serverName: string,
    gameServerName: string,
    ports: InstallRequestPayload['ports'],
    portLabels: InstallRequestPayload['portLabels'],
    healthcheck: InstallHealthcheckPayload,
    requireSteamCredentials?: boolean,
    steamUsername?: string,
    steamPassword?: string
  ) => Promise<void>;
  installing?: boolean;
  installError?: string | null;
  installProgressPercent?: number | null;
  installStatus?: string | null;
  installServerId?: number | null;
  installPermissionsSyncing?: boolean;
  canOpenInstallLog?: boolean;
  usedPorts?: {
    tcp: number[];
    udp: number[];
  };
  usedServerNames?: string[];
  canInstall?: boolean;

  onClearError?: () => void;
  onOpenConsole?: (serverId: number) => void;
}

interface GameInfo {
  id: string;
  name: string;
  gameServerName: string;
  dockerImage: string | null;
  healthcheck: InstallHealthcheckPayload | null;
  tcpPorts: Record<string, string> | null;
  udpPorts: Record<string, string> | null;
  isCheckedByAdmin: boolean;
  requireSteamCredentials: boolean;
  requireGameCopy: boolean;
}

function SteamCredentialsBadge() {
  const [logoFailed, setLogoFailed] = useState(false);
  const steamLogoSrc = `${import.meta.env.BASE_URL}Steam_Logo.png`;

  return (
    <span
      title="Steam credentials required"
      aria-label="Steam credentials required"
      className="inline-flex h-4 w-4 items-center justify-center flex-shrink-0"
    >
      {logoFailed ? (
        <span className="text-[10px] font-semibold text-slate-200">S</span>
      ) : (
        <img
          src={steamLogoSrc}
          alt=""
          aria-hidden="true"
          className="h-4 w-4 object-contain"
          onError={() => setLogoFailed(true)}
        />
      )}
    </span>
  );
}

function GameCopyRequiredBadge() {
  return (
    <span
      title="Steam game copy required"
      aria-label="Steam game copy required"
      className="inline-flex h-4 w-4 items-center justify-center text-indigo-200 flex-shrink-0"
    >
      <Disc className="h-4 w-4" />
    </span>
  );
}

export function InstallGameServer({
  isOpen,
  onClose,
  onInstall,
  installing,
  installError,
  installProgressPercent,
  installStatus,
  installServerId,
  installPermissionsSyncing = false,
  canOpenInstallLog = false,
  usedPorts,
  usedServerNames,
  canInstall = true,
  onClearError,
  onOpenConsole,
}: InstallGameServerProps) {
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installingGame, setInstallingGame] = useState<string>('');
  const [selectedGame, setSelectedGame] = useState<GameInfo | null>(null);
  const [showInstallConfigModal, setShowInstallConfigModal] = useState(false);
  const [isPendingGamesExpanded, setIsPendingGamesExpanded] = useState(false);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [lastInstallAttempt, setLastInstallAttempt] = useState<{
    game: GameInfo;
    request: InstallRequestPayload;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchCatalogGames = async () => {
      setGamesLoading(true);
      setGamesError(null);
      try {
        const catalogGames = await apiClient.getCatalogGames();

        if (!isMounted) return;

        const normalized = catalogGames.games.map((game) => ({
          id: game.shortname,
          name: game.gamename,
          gameServerName: game.gameservername,
          dockerImage: game.dockerImage ?? null,
          healthcheck: game.healthcheck ?? null,
          tcpPorts: game.tcpPorts ?? null,
          udpPorts: game.udpPorts ?? null,
          isCheckedByAdmin: Boolean(game.isCheckedByAdmin),
          requireSteamCredentials: Boolean(game.requireSteamCredentials),
          requireGameCopy: Boolean(game.requireGameCopy),
        }));

        setGames(normalized);
      } catch (error) {
        if (!isMounted) return;
        setGamesError('Unable to load the game list.');
      } finally {
        if (!isMounted) return;
        setGamesLoading(false);
      }
    };

    fetchCatalogGames();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsPendingGamesExpanded(false);
    }
  }, [isOpen]);

  const handleInstallClick = (game: GameInfo) => {
    const gameForInstall = game.isCheckedByAdmin
      ? game
      : {
          ...game,
          tcpPorts: null,
          udpPorts: null,
          healthcheck: null,
        };

    setSelectedGame(gameForInstall);
    setShowInstallConfigModal(true);
  };

  const handleInstallConfirm = async (data: InstallRequestPayload) => {
    if (!selectedGame) return;

    const selectedGameSnapshot = selectedGame;
    const gameKey = selectedGame.id;
    setLastInstallAttempt({
      game: selectedGameSnapshot,
      request: data.requireSteamCredentials ? { ...data, steamPassword: '' } : data,
    });

    setShowInstallConfigModal(false);
    setSelectedGame(null);

    setInstallingGame(selectedGameSnapshot.name);
    setShowInstallModal(true);
    onClose();

    await onInstall(
      gameKey,
      data.serverName,
      data.gameServerName,
      data.ports,
      data.portLabels,
      data.healthcheck,
      data.requireSteamCredentials,
      data.steamUsername,
      data.steamPassword
    );
  };

  const handleInstallCancel = () => {
    setShowInstallConfigModal(false);
    setSelectedGame(null);
    onClearError?.();
  };

  const handleRetryInstall = () => {
    if (!lastInstallAttempt) return;
    setShowInstallModal(false);
    setSelectedGame(lastInstallAttempt.game);
    setShowInstallConfigModal(true);
    onClearError?.();
  };

  const handleOpenInstallLog = (serverId: number) => {
    onClose();
    onOpenConsole?.(serverId);
  };

  const handleClose = () => {
    onClose();
    onClearError?.();
  };

  const validatedGames = games.filter((game) => game.isCheckedByAdmin);
  const pendingGames = games.filter((game) => !game.isCheckedByAdmin);

  const cardBg = 'bg-[#111827]';
  const cardBorder = 'border-gray-800';
  const textPrimary = 'text-white';
  const textSecondary = 'text-gray-400';
  const rowHover = 'hover:bg-[#1f2937]';
  const borderColor = 'border-gray-700';
  const buttonPrimary = 'bg-[#0050D7] hover:bg-[#157EEA] hover:text-white';
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          {!showInstallConfigModal && (
            <div
              className={`${cardBg} w-full max-w-3xl rounded-xl border ${cardBorder} shadow-2xl max-h-[90vh] overflow-hidden`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={`flex items-start justify-between border-b ${borderColor} p-4 md:p-5`}>
                <div className="min-w-0">
                  <h2 className={`text-lg md:text-xl font-semibold ${textPrimary}`}>
                    Install Game Server
                  </h2>
                  <p className={`mt-1 text-sm ${textSecondary}`}>
                    Supported and untested games
                  </p>
                </div>
                <AppButton
                  type="button"
                  onClick={handleClose}
                  className={`ml-3 rounded p-2 hover:bg-gray-700 transition-colors ${textSecondary} hover:text-red-400`}
                  aria-label="Close install game modal"
                >
                  <X className="w-5 h-5" />
                </AppButton>
              </div>

              <div className="max-h-[calc(90vh-88px)] overflow-y-auto hide-scrollbar p-4 md:p-5 space-y-4">
                <section>
                  <div className="px-1 pb-3">
                    <h3 className={`text-base md:text-lg font-semibold ${textPrimary}`}>
                      Installable games
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-400">
                      <span className="inline-flex items-center gap-1.5">
                        <SteamCredentialsBadge />
                        Steam login required
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <GameCopyRequiredBadge />
                        Steam game copy required
                      </span>
                    </div>
                  </div>

                  <div className="mt-1 rounded-lg border border-gray-600/70 bg-[#0f172a] overflow-hidden">
                    <div className={`divide-y ${borderColor}`}>
                      {gamesLoading && (
                        <div className={`px-4 md:px-6 py-4 ${textSecondary}`}>Loading games...</div>
                      )}

                      {gamesError && (
                        <div className={`px-4 md:px-6 py-4 text-sm text-red-300`}>{gamesError}</div>
                      )}

                      {!gamesLoading && !gamesError && validatedGames.length === 0 && (
                        <div className={`px-4 md:px-6 py-4 ${textSecondary}`}>
                          No games available right now.
                        </div>
                      )}

                      {validatedGames.map((game) => (
                        <div
                          key={game.id}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between px-4 md:px-6 py-3 transition-colors ${rowHover} gap-3 sm:gap-4`}
                        >
                          <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className={`font-medium ${textPrimary} min-w-0 truncate`}>
                                {game.name}
                              </span>
                              {(game.requireSteamCredentials || game.requireGameCopy) && (
                                <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                                  {game.requireSteamCredentials && <SteamCredentialsBadge />}
                                  {game.requireGameCopy && <GameCopyRequiredBadge />}
                                </span>
                              )}
                            </div>

                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-green-500/10 text-green-400 border border-green-500/30">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Available
                            </span>
                          </div>

                          <AppButton
                            onClick={() => {
                              if (!canInstall) return;
                              handleInstallClick(game);
                            }}
                            disabled={!canInstall}
                            className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg font-medium transition-all text-sm w-full sm:w-auto whitespace-nowrap ${
                              canInstall
                                ? `${buttonPrimary}`
                                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            Install
                            <ArrowRight className="w-4 h-4" />
                          </AppButton>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section>
                  <AppButton
                    type="button"
                    onClick={() => setIsPendingGamesExpanded((prev) => !prev)}
                    className="w-full px-1 py-1 flex items-center justify-between transition-colors"
                    aria-expanded={isPendingGamesExpanded}
                  >
                    <div className="text-left">
                      <h3 className={`text-base md:text-lg font-semibold ${textPrimary}`}>
                        Untested Games
                      </h3>
                      <p className={`text-sm ${textSecondary} mt-1`}>
                        Installable games without validated presets
                      </p>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 ${textSecondary} transition-transform duration-200 ${
                        isPendingGamesExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </AppButton>

                  {isPendingGamesExpanded && (
                    <div className="mt-1 rounded-lg border border-gray-600/70 bg-[#0f172a] overflow-hidden">
                      <div className={`divide-y ${borderColor}`}>
                        {!gamesLoading && pendingGames.length === 0 && (
                          <div className={`px-4 md:px-6 py-4 ${textSecondary}`}>
                            No pending games.
                          </div>
                        )}

                        {pendingGames.map((game) => (
                          <div
                            key={game.id}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between px-4 md:px-6 py-3 transition-colors ${rowHover} gap-3 sm:gap-4`}
                          >
                            <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className={`font-medium ${textPrimary} min-w-0 truncate`}>
                                  {game.name}
                                </span>
                                {(game.requireSteamCredentials || game.requireGameCopy) && (
                                  <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                                    {game.requireSteamCredentials && <SteamCredentialsBadge />}
                                    {game.requireGameCopy && <GameCopyRequiredBadge />}
                                  </span>
                                )}
                              </div>

                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-orange-500/10 text-orange-400 border border-orange-500/30">
                                <Wrench className="w-3.5 h-3.5" />
                                Untested
                              </span>
                            </div>

                            <AppButton
                              onClick={() => {
                                if (!canInstall) return;
                                handleInstallClick(game);
                              }}
                              disabled={!canInstall}
                              className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg font-medium transition-all text-sm w-full sm:w-auto whitespace-nowrap ${
                                canInstall
                                  ? `${buttonPrimary}`
                                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                              }`}
                            >
                              Install
                              <ArrowRight className="w-4 h-4" />
                            </AppButton>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      )}

      <InstallationProgressModal
        isOpen={showInstallModal}
        gameName={installingGame}
        installing={installing}
        installError={installError}
        progressPercent={installProgressPercent ?? undefined}
        status={installStatus ?? undefined}
        serverId={installServerId ?? undefined}
        permissionsSyncing={installPermissionsSyncing}
        canOpenConsole={canOpenInstallLog}
        onClose={() => setShowInstallModal(false)}
        onOpenConsole={handleOpenInstallLog}
        onRetryInstall={handleRetryInstall}
      />

      {selectedGame && (
        <InstallGameModal
          isOpen={showInstallConfigModal}
          hideBackdrop={isOpen}
          gameKey={selectedGame.id}
          gameName={selectedGame.name}
          gameServerName={selectedGame.gameServerName}
          requireSteamCredentials={selectedGame.requireSteamCredentials}
          dockerImage={selectedGame.dockerImage}
          healthcheck={selectedGame.healthcheck}
          usedPorts={usedPorts}
          usedServerNames={usedServerNames}
          initialConfig={
            lastInstallAttempt?.game.id === selectedGame.id ? lastInstallAttempt.request : null
          }
          portsDefinition={{
            tcp: selectedGame.tcpPorts,
            udp: selectedGame.udpPorts,
          }}
          onConfirm={handleInstallConfirm}
          onCancel={handleInstallCancel}
          isLoading={installing}
          error={installError}
        />
      )}
    </>
  );
}



