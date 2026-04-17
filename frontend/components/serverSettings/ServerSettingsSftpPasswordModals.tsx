import { Eye, EyeOff, Info, Key, X } from 'lucide-react';
import { AppButton, AppInput } from '../../src/ui/components';

interface ServerSettingsSftpPasswordModalsProps {
  modalBg: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  hoverBg: string;
  inputBg: string;
  inputBorder: string;
  showFirstTimePasswordModal: boolean;
  closeFirstTimePasswordModal: () => void;
  firstTimePassword: string;
  setFirstTimePassword: (value: string) => void;
  firstTimeConfirmPassword: string;
  setFirstTimeConfirmPassword: (value: string) => void;
  showFirstTimePassword: boolean;
  setShowFirstTimePassword: (value: boolean) => void;
  showFirstTimeConfirmPassword: boolean;
  setShowFirstTimeConfirmPassword: (value: boolean) => void;
  firstTimePasswordError: string | null;
  clearFirstTimePasswordError: () => void;
  handleFirstTimePasswordSubmit: () => Promise<void> | void;
  sftpPasswordLoading: boolean;
  showSftpPasswordModal: boolean;
  closeSftpPasswordModal: () => void;
  sftpModalPassword: string;
  setSftpModalPassword: (value: string) => void;
  sftpModalConfirmPassword: string;
  setSftpModalConfirmPassword: (value: string) => void;
  showSftpModalPassword: boolean;
  setShowSftpModalPassword: (value: boolean) => void;
  showSftpModalConfirmPassword: boolean;
  setShowSftpModalConfirmPassword: (value: boolean) => void;
  sftpModalPasswordError: string | null;
  clearSftpModalPasswordError: () => void;
  handleUpdateSftpPasswordModal: () => Promise<void> | void;
}

interface PasswordVisibilityButtonProps {
  isVisible: boolean;
  textClassName: string;
  onToggle: () => void;
}

function PasswordVisibilityButton({
  isVisible,
  textClassName,
  onToggle,
}: PasswordVisibilityButtonProps) {
  return (
    <AppButton
      type="button"
      tone="ghost"
      onClick={onToggle}
      className={`absolute inset-y-0 right-0 flex h-full items-center justify-center border-none bg-transparent px-3 ${textClassName} hover:text-[var(--color-cyan-400)] transition-colors`}
      aria-label={isVisible ? 'Hide password' : 'Show password'}
    >
      {isVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
    </AppButton>
  );
}

export function ServerSettingsSftpPasswordModals({
  modalBg,
  borderColor,
  textPrimary,
  textSecondary,
  hoverBg,
  inputBg,
  inputBorder,
  showFirstTimePasswordModal,
  closeFirstTimePasswordModal,
  firstTimePassword,
  setFirstTimePassword,
  firstTimeConfirmPassword,
  setFirstTimeConfirmPassword,
  showFirstTimePassword,
  setShowFirstTimePassword,
  showFirstTimeConfirmPassword,
  setShowFirstTimeConfirmPassword,
  firstTimePasswordError,
  clearFirstTimePasswordError,
  handleFirstTimePasswordSubmit,
  sftpPasswordLoading,
  showSftpPasswordModal,
  closeSftpPasswordModal,
  sftpModalPassword,
  setSftpModalPassword,
  sftpModalConfirmPassword,
  setSftpModalConfirmPassword,
  showSftpModalPassword,
  setShowSftpModalPassword,
  showSftpModalConfirmPassword,
  setShowSftpModalConfirmPassword,
  sftpModalPasswordError,
  clearSftpModalPasswordError,
  handleUpdateSftpPasswordModal,
}: ServerSettingsSftpPasswordModalsProps) {
  return (
    <>
      {showFirstTimePasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div
            className={`${modalBg} border ${borderColor} rounded-lg shadow-xl max-w-md w-full p-6`}
          >
            <div className="flex items-start justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#0050D7]/10 rounded-lg">
                  <Key className="w-6 h-6 text-[var(--color-cyan-400)]" />
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${textPrimary}`}>Set SFTP Password</h3>
                  <p className={`text-sm ${textSecondary}`}>Required for first activation</p>
                </div>
              </div>
              <AppButton
                onClick={closeFirstTimePasswordModal}
                className={`p-2 rounded ${hoverBg} transition-colors ${textSecondary} hover:text-red-400 flex-shrink-0`}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </AppButton>
            </div>

            <div
              className={`flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 mb-6`}
            >
              <Info className="w-4 h-4 text-[var(--color-cyan-400)] flex-shrink-0 mt-0.5" />
              <p className={`text-xs ${textSecondary}`}>
                You must set a password before enabling SFTP access. This password will be used to
                connect via SFTP clients.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className={`block text-sm font-medium ${textSecondary} mb-2`}>
                  Password
                </label>
                <div className="relative">
                  <AppInput
                    type={showFirstTimePassword ? 'text' : 'password'}
                    value={firstTimePassword}
                    onChange={(event) => {
                      setFirstTimePassword(event.target.value);
                      clearFirstTimePasswordError();
                    }}
                    className={`w-full px-4 py-2.5 pr-12 ${inputBg} border ${inputBorder} rounded-lg ${textPrimary} focus:outline-none focus:border-[var(--color-cyan-400)]`}
                    placeholder="Enter password"
                    autoFocus
                  />
                  <PasswordVisibilityButton
                    isVisible={showFirstTimePassword}
                    textClassName={textSecondary}
                    onToggle={() => setShowFirstTimePassword(!showFirstTimePassword)}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium ${textSecondary} mb-2`}>
                  Confirm Password
                </label>
                <div className="relative">
                  <AppInput
                    type={showFirstTimeConfirmPassword ? 'text' : 'password'}
                    value={firstTimeConfirmPassword}
                    onChange={(event) => {
                      setFirstTimeConfirmPassword(event.target.value);
                      clearFirstTimePasswordError();
                    }}
                    className={`w-full px-4 py-2.5 pr-12 ${inputBg} border ${inputBorder} rounded-lg ${textPrimary} focus:outline-none focus:border-[var(--color-cyan-400)]`}
                    placeholder="Confirm password"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && firstTimePassword && firstTimeConfirmPassword) {
                        void handleFirstTimePasswordSubmit();
                      }
                    }}
                  />
                  <PasswordVisibilityButton
                    isVisible={showFirstTimeConfirmPassword}
                    textClassName={textSecondary}
                    onToggle={() => setShowFirstTimeConfirmPassword(!showFirstTimeConfirmPassword)}
                  />
                </div>
              </div>

              <div className="bg-[#1f2937] border border-gray-700 rounded-lg p-3">
                <p className={`text-xs ${textSecondary} mb-2 font-medium`}>
                  Password requirements:
                </p>
                <ul className={`text-xs ${textSecondary} space-y-1`}>
                  <li className={firstTimePassword.length >= 10 ? 'text-green-500' : ''}>
                    - Minimum 10 characters
                  </li>
                  <li className={/[A-Z]/.test(firstTimePassword) ? 'text-green-500' : ''}>
                    - At least one uppercase letter
                  </li>
                  <li className={/[0-9]/.test(firstTimePassword) ? 'text-green-500' : ''}>
                    - At least one number
                  </li>
                  <li
                    className={
                      /[!@#$%^&*(),.?":{}|<>]/.test(firstTimePassword) ? 'text-green-500' : ''
                    }
                  >
                    - At least one special character
                  </li>
                </ul>
              </div>

              {firstTimePasswordError && (
                <div className="text-sm text-red-400 text-center">{firstTimePasswordError}</div>
              )}
            </div>

            <div className="flex gap-3">
              <AppButton
                onClick={closeFirstTimePasswordModal}
                disabled={sftpPasswordLoading}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${textSecondary} bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Cancel
              </AppButton>
              <AppButton
                onClick={() => void handleFirstTimePasswordSubmit()}
                disabled={sftpPasswordLoading || !firstTimePassword || !firstTimeConfirmPassword}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors bg-[#0050D7] hover:bg-[#157EEA] hover:text-white text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Key className="w-4 h-4" />
                {sftpPasswordLoading ? 'Setting up...' : 'Set Password & Enable'}
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {showSftpPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div
            className={`${modalBg} border ${borderColor} rounded-lg shadow-xl max-w-md w-full p-6`}
          >
            <div className="flex items-start justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#0050D7]/10 rounded-lg">
                  <Key className="w-6 h-6 text-[var(--color-cyan-400)]" />
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${textPrimary}`}>Change SFTP Password</h3>
                  <p className={`text-sm ${textSecondary}`}>Update your SFTP credentials</p>
                </div>
              </div>
              <AppButton
                onClick={closeSftpPasswordModal}
                className={`p-2 rounded ${hoverBg} transition-colors ${textSecondary} hover:text-red-400 flex-shrink-0`}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </AppButton>
            </div>

            <div
              className={`flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 mb-6`}
            >
              <Info className="w-4 h-4 text-[var(--color-cyan-400)] flex-shrink-0 mt-0.5" />
              <p className={`text-xs ${textSecondary}`}>
                Enter a strong password that meets all security requirements below.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className={`block text-sm font-medium ${textSecondary} mb-2`}>
                  New Password
                </label>
                <div className="relative">
                  <AppInput
                    type={showSftpModalPassword ? 'text' : 'password'}
                    value={sftpModalPassword}
                    onChange={(event) => {
                      setSftpModalPassword(event.target.value);
                      clearSftpModalPasswordError();
                    }}
                    className={`w-full px-4 py-2.5 pr-12 ${inputBg} border ${inputBorder} rounded-lg ${textPrimary} focus:outline-none focus:border-[var(--color-cyan-400)]`}
                    placeholder="Enter password"
                    autoFocus
                  />
                  <PasswordVisibilityButton
                    isVisible={showSftpModalPassword}
                    textClassName={textSecondary}
                    onToggle={() => setShowSftpModalPassword(!showSftpModalPassword)}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium ${textSecondary} mb-2`}>
                  Confirm Password
                </label>
                <div className="relative">
                  <AppInput
                    type={showSftpModalConfirmPassword ? 'text' : 'password'}
                    value={sftpModalConfirmPassword}
                    onChange={(event) => {
                      setSftpModalConfirmPassword(event.target.value);
                      clearSftpModalPasswordError();
                    }}
                    className={`w-full px-4 py-2.5 pr-12 ${inputBg} border ${inputBorder} rounded-lg ${textPrimary} focus:outline-none focus:border-[var(--color-cyan-400)]`}
                    placeholder="Confirm password"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && sftpModalPassword && sftpModalConfirmPassword) {
                        void handleUpdateSftpPasswordModal();
                      }
                    }}
                  />
                  <PasswordVisibilityButton
                    isVisible={showSftpModalConfirmPassword}
                    textClassName={textSecondary}
                    onToggle={() => setShowSftpModalConfirmPassword(!showSftpModalConfirmPassword)}
                  />
                </div>
              </div>

              <div className="bg-[#1f2937] border border-gray-700 rounded-lg p-3">
                <p className={`text-xs ${textSecondary} mb-2 font-medium`}>
                  Password requirements:
                </p>
                <ul className={`text-xs ${textSecondary} space-y-1`}>
                  <li className={sftpModalPassword.length >= 10 ? 'text-green-500' : ''}>
                    - Minimum 10 characters
                  </li>
                  <li className={/[A-Z]/.test(sftpModalPassword) ? 'text-green-500' : ''}>
                    - At least one uppercase letter
                  </li>
                  <li className={/[0-9]/.test(sftpModalPassword) ? 'text-green-500' : ''}>
                    - At least one number
                  </li>
                  <li
                    className={
                      /[!@#$%^&*(),.?":{}|<>]/.test(sftpModalPassword) ? 'text-green-500' : ''
                    }
                  >
                    - At least one special character
                  </li>
                </ul>
              </div>

              {sftpModalPasswordError && (
                <div className="text-sm text-red-400 text-center">{sftpModalPasswordError}</div>
              )}
            </div>

            <div className="flex gap-3">
              <AppButton
                onClick={closeSftpPasswordModal}
                disabled={sftpPasswordLoading}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${textSecondary} bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Cancel
              </AppButton>
              <AppButton
                onClick={() => void handleUpdateSftpPasswordModal()}
                disabled={sftpPasswordLoading || !sftpModalPassword || !sftpModalConfirmPassword}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors bg-[#0050D7] hover:bg-[#157EEA] hover:text-white text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Key className="w-4 h-4" />
                {sftpPasswordLoading ? 'Updating...' : 'Change Password'}
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}



