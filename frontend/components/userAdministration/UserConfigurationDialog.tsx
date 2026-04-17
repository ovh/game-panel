import { KeyRound, Save, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { AppButton, AppInput, AppToggle } from '../../src/ui/components';

interface SelectedUser {
  id: number;
  isRoot: boolean;
}

interface UserConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: SelectedUser | null;
  username: string;
  setUsername: (value: string) => void;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  handleSaveUser: () => void;
  saveUserLoading: boolean;
  handleDeleteUser: () => void;
  deleteUserLoading: boolean;
  newPassword: string;
  setNewPassword: (value: string) => void;
  newPasswordConfirm: string;
  setNewPasswordConfirm: (value: string) => void;
  handleResetPassword: () => void;
  resetPasswordLoading: boolean;
}

export function UserConfigurationDialog({
  open,
  onOpenChange,
  selectedUser,
  username,
  setUsername,
  enabled,
  setEnabled,
  handleSaveUser,
  saveUserLoading,
  handleDeleteUser,
  deleteUserLoading,
  newPassword,
  setNewPassword,
  newPasswordConfirm,
  setNewPasswordConfirm,
  handleResetPassword,
  resetPasswordLoading,
}: UserConfigurationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] sm:w-[84vw] lg:w-[64vw] xl:w-[56vw] max-h-[90vh] sm:max-w-[480px] xl:max-w-[480px] overflow-hidden border border-gray-700/80 bg-[#0f172a] p-0 text-white">
        <div className="max-h-[90vh] overflow-y-auto hide-scrollbar modal-scrollbar-dark p-6 md:p-7">
          <DialogHeader className="border-b border-gray-800 pb-6">
            <DialogTitle className="text-xl text-white">User configuration</DialogTitle>
            <DialogDescription className="text-gray-400 leading-relaxed">
              Profile, global permissions, server access and password in one place.
            </DialogDescription>
          </DialogHeader>

          {!selectedUser && <p className="text-sm text-gray-400">No user selected.</p>}
          {selectedUser &&
            (selectedUser.isRoot ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                Super Admin account cannot be edited or deleted here.
              </div>
            ) : (
              <div className="space-y-7">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-gray-300">Username</span>
                  <AppInput
                    name="edit-user-username"
                    autoComplete="off"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Username"
                    className="prevent-autofill w-full rounded border border-gray-700 bg-[#1f2937] px-3 py-2 text-sm text-white"
                  />
                </label>

                <div className="inline-flex items-center gap-3 rounded-lg border border-gray-700 bg-[#0f172a] px-4 py-2.5 text-sm text-gray-200">
                  <AppToggle
                    ariaLabel="Account enabled"
                    checked={enabled}
                    size="standard"
                    onChange={setEnabled}
                    className="shrink-0"
                  />
                  <span>Account enabled</span>
                </div>

                <div className="flex flex-wrap gap-3">
                  <AppButton
                    onClick={handleSaveUser}
                    disabled={saveUserLoading}
                    className="inline-flex items-center gap-2 rounded bg-[#0050D7] px-4 py-2 text-sm font-medium text-white hover:bg-[#157EEA] hover:text-white disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saveUserLoading ? 'Saving...' : 'Save'}
                  </AppButton>
                  <AppButton
                    onClick={handleDeleteUser}
                    disabled={deleteUserLoading}
                    className="inline-flex items-center gap-2 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleteUserLoading ? 'Deleting...' : 'Delete user'}
                  </AppButton>
                </div>

                <div className="border-t border-gray-700 pt-6">
                  <p className="mb-3 text-sm font-semibold text-white">Reset password</p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-gray-300">
                        New password
                      </span>
                      <AppInput
                        type="password"
                        name={`reset-password-${selectedUser.id}`}
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="New password (8+)"
                        className="prevent-autofill w-full rounded border border-gray-700 bg-[#1f2937] px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-gray-300">
                        Confirm new password
                      </span>
                      <AppInput
                        type="password"
                        name={`reset-password-confirm-${selectedUser.id}`}
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        value={newPasswordConfirm}
                        onChange={(event) => setNewPasswordConfirm(event.target.value)}
                        placeholder="Retype new password"
                        className="prevent-autofill w-full rounded border border-gray-700 bg-[#1f2937] px-3 py-2 text-sm text-white"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <AppButton
                      onClick={handleResetPassword}
                      disabled={resetPasswordLoading}
                      className="inline-flex items-center justify-center gap-2 rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-60"
                    >
                      <KeyRound className="h-4 w-4" />
                      {resetPasswordLoading ? 'Processing...' : 'Reset'}
                    </AppButton>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}



