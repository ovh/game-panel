import { Check, Copy, Info, Key } from 'lucide-react';
import { AppButton, AppToggle } from '../../src/ui/components';

interface SftpTabProps {
  contentBg: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  serverName: string;
  sftpError: string | null;
  sftpEnabled: boolean;
  sftpToggleLoading: boolean;
  handleEnableSftp: () => void;
  handleDisableSftp: () => void;
  publicConnectionHost: string;
  copiedSftp: string | null;
  handleCopySftpDetail: (value: string, field: string) => void;
  sftpUsername: string;
  setShowSftpPasswordModal: (open: boolean) => void;
}

export function SftpTab({
  contentBg,
  borderColor,
  textPrimary,
  textSecondary,
  serverName,
  sftpError,
  sftpEnabled,
  sftpToggleLoading,
  handleEnableSftp,
  handleDisableSftp,
  publicConnectionHost,
  copiedSftp,
  handleCopySftpDetail,
  sftpUsername,
  setShowSftpPasswordModal,
}: SftpTabProps) {
  return (
    <div className="h-full flex flex-col p-4 sm:p-5 md:p-6 overflow-hidden">
      <>
        {sftpError ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-xs sm:text-sm text-red-400">{sftpError}</p>
          </div>
        ) : null}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-5 flex-shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="min-w-0">
              <h3 className={`text-lg sm:text-xl md:text-2xl font-bold ${textPrimary}`}>
                SFTP Access
              </h3>
              <p className={`text-xs sm:text-sm ${textSecondary} truncate`}>
                Secure file transfer for {serverName}
              </p>
            </div>
          </div>
        </div>

        <div
          className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-4 sm:mb-5 flex-shrink-0`}
        >
          <Info className="w-4 sm:w-5 h-4 sm:h-5 text-[var(--color-cyan-400)] flex-shrink-0" />
          <span className={`text-xs sm:text-sm ${textSecondary}`}>
            SFTP allows secure file transfer.
            <a
              href="https://help.ovhcloud.com/csm/en-gb-dedicated-servers-store-retrieve-data-via-sftp?id=kb_article_view&sysparm_article=KB0043321"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-cyan-400)] hover:underline ml-1"
            >
              Learn more
            </a>
          </span>
        </div>

        <div className="space-y-4 sm:space-y-5">
          <div
            className={`${contentBg} border ${borderColor} rounded-lg px-4 py-3 sm:px-5 sm:py-3.5`}
          >
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <div>
                <p className={`text-sm sm:text-base font-semibold ${textPrimary}`}>SFTP access</p>
              </div>
              <AppToggle
                ariaLabel="Toggle SFTP access"
                checked={sftpEnabled}
                size="standard"
                disabled={sftpToggleLoading}
                onChange={() => {
                  if (sftpEnabled) {
                    handleDisableSftp();
                    return;
                  }
                  handleEnableSftp();
                }}
                className="flex-shrink-0"
              />
            </div>
          </div>

          {sftpEnabled && (
            <div className={`${contentBg} border ${borderColor} rounded-lg p-4 sm:p-5`}>
              <div className="space-y-4">
                <h4 className={`text-sm sm:text-base font-semibold ${textPrimary}`}>
                  Connection Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <p className={`text-xs font-medium ${textSecondary} mb-1.5`}>Host</p>
                    <div className="flex items-center gap-2">
                      <p
                        className={`flex-1 text-xs sm:text-sm font-mono font-semibold ${textPrimary} bg-gray-800 rounded px-3 py-2 break-all`}
                      >
                        {publicConnectionHost}
                      </p>
                      <AppButton
                        onClick={() => handleCopySftpDetail(publicConnectionHost, 'host')}
                        className={`p-2 rounded transition-colors flex-shrink-0 ${
                          copiedSftp === 'host'
                            ? 'bg-green-500/20 text-green-400'
                            : `bg-gray-700/50 ${textSecondary} hover:bg-gray-700`
                        }`}
                        title={copiedSftp === 'host' ? 'Copied!' : 'Copy host'}
                      >
                        {copiedSftp === 'host' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </AppButton>
                    </div>
                  </div>

                  <div>
                    <p className={`text-xs font-medium ${textSecondary} mb-1.5`}>Username</p>
                    <div className="flex items-center gap-2">
                      <p
                        className={`flex-1 text-xs sm:text-sm font-mono font-semibold ${textPrimary} bg-gray-800 rounded px-3 py-2 break-all`}
                      >
                        {sftpUsername || 'N/A'}
                      </p>
                      <AppButton
                        onClick={() => handleCopySftpDetail(sftpUsername || '', 'username')}
                        disabled={!sftpUsername}
                        className={`p-2 rounded transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                          copiedSftp === 'username'
                            ? 'bg-green-500/20 text-green-400'
                            : `bg-gray-700/50 ${textSecondary} hover:bg-gray-700`
                        }`}
                        title={copiedSftp === 'username' ? 'Copied!' : 'Copy username'}
                      >
                        {copiedSftp === 'username' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </AppButton>
                    </div>
                  </div>

                  <div>
                    <p className={`text-xs font-medium ${textSecondary} mb-1.5`}>Port</p>
                    <div className="flex items-center gap-2">
                      <p
                        className={`flex-1 text-xs sm:text-sm font-mono font-semibold ${textPrimary} bg-gray-800 rounded px-3 py-2`}
                      >
                        22
                      </p>
                      <AppButton
                        onClick={() => handleCopySftpDetail('22', 'port')}
                        className={`p-2 rounded transition-colors flex-shrink-0 ${
                          copiedSftp === 'port'
                            ? 'bg-green-500/20 text-green-400'
                            : `bg-gray-700/50 ${textSecondary} hover:bg-gray-700`
                        }`}
                        title={copiedSftp === 'port' ? 'Copied!' : 'Copy port'}
                      >
                        {copiedSftp === 'port' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </AppButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {sftpEnabled && (
            <AppButton
              onClick={() => setShowSftpPasswordModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 sm:py-3.5 rounded-lg text-sm sm:text-base font-semibold transition-colors bg-[#0050D7] hover:bg-[#157EEA] hover:text-white text-white"
            >
              <Key className="w-5 h-5" />
              Change Password
            </AppButton>
          )}
        </div>
      </>
    </div>
  );
}



