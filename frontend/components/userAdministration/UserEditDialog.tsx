import type { Dispatch, SetStateAction } from 'react';
import { Save } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { AppButton, AppInput, AppSelect, AppToggle } from '../../src/ui/components';
import {
  GLOBAL_OPTIONS,
  SERVER_OPTIONS,
  SERVER_PRESETS,
  getAccessLevelLabel,
  isServerPermissionChecked,
  samePermissionSet,
  togglePermission,
  toggleServerPermission,
} from './utils';

interface SelectedUserRef {
  id: number;
  isRoot: boolean;
}

interface SelectedAccessUser {
  userId: number;
  username: string;
  permissions: string[];
}

interface UserEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: SelectedUserRef | null;
  username: string;
  setUsername: (value: string) => void;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  newPasswordConfirm: string;
  setNewPasswordConfirm: (value: string) => void;
  globalKnown: string[];
  setGlobalKnown: Dispatch<SetStateAction<string[]>>;
  selectedServerId: string;
  setSelectedServerId: (serverId: string) => void;
  servers: Array<{ id: string; name: string }>;
  selectedAccessUser: SelectedAccessUser | null;
  addMemberPerms: string[];
  addMemberKnown: string[];
  setAddMemberKnown: Dispatch<SetStateAction<string[]>>;
  applyAddPreset: (presetId: string) => void;
  membersError: string | null;
  onSaveChanges: () => void;
  saveLoading: boolean;
}

export function UserEditDialog({
  open,
  onOpenChange,
  selectedUser,
  username,
  setUsername,
  enabled,
  setEnabled,
  newPassword,
  setNewPassword,
  newPasswordConfirm,
  setNewPasswordConfirm,
  globalKnown,
  setGlobalKnown,
  selectedServerId,
  setSelectedServerId,
  servers,
  selectedAccessUser,
  addMemberPerms,
  addMemberKnown,
  setAddMemberKnown,
  applyAddPreset,
  membersError,
  onSaveChanges,
  saveLoading,
}: UserEditDialogProps) {
  const selectedServerName =
    servers.find((server) => server.id === selectedServerId)?.name || 'this server';
  const isBusy = saveLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] sm:w-[86vw] lg:w-[68vw] xl:w-[62vw] max-h-[90vh] sm:max-w-[920px] xl:max-w-[980px] overflow-hidden border border-gray-700/80 bg-[#0f172a] p-0 text-white">
        <div className="max-h-[90vh] overflow-y-auto hide-scrollbar modal-scrollbar-dark p-6 md:p-7">
          <DialogHeader className="border-b border-gray-800 pb-5">
            <DialogTitle className="text-xl text-white">Edit</DialogTitle>
            <DialogDescription className="text-gray-400 leading-relaxed">
              Update user configuration and permissions in one place.
            </DialogDescription>
          </DialogHeader>

          {!selectedUser && <p className="pt-6 text-sm text-gray-400">No user selected.</p>}
          {selectedUser &&
            (selectedUser.isRoot ? (
              <div className="pt-6">
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  Super Admin account cannot be edited or deleted here.
                </div>
              </div>
            ) : (
              <div className="space-y-5 pt-6">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
                  <section className="rounded-lg border border-gray-700 bg-[#1f2937] p-4">
                    <h3 className="text-lg font-semibold text-white">User configuration</h3>
                    <div className="mt-3 space-y-4">
                      <div className="inline-flex items-center gap-3 rounded-lg border border-gray-700 bg-[#111827] px-3 py-2 text-sm text-gray-200">
                        <AppToggle
                          ariaLabel="Account enabled"
                          checked={enabled}
                          size="compact"
                          onChange={setEnabled}
                        />
                        <span>Account enabled</span>
                      </div>

                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-gray-200">User name</span>
                        <AppInput
                          name="edit-user-username"
                          autoComplete="off"
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                          placeholder="Username"
                          className="prevent-autofill w-full rounded border border-gray-700 bg-[#0f172a] px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-gray-200">
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
                            placeholder="New password"
                            className="prevent-autofill w-full rounded border border-gray-700 bg-[#0f172a] px-3 py-2 text-sm text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-gray-200">
                            Retype new password
                          </span>
                          <AppInput
                            type="password"
                            name={`reset-password-confirm-${selectedUser.id}`}
                            autoComplete="new-password"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            value={newPasswordConfirm}
                            onChange={(event) => setNewPasswordConfirm(event.target.value)}
                            placeholder="Retype password"
                            className="prevent-autofill w-full rounded border border-gray-700 bg-[#0f172a] px-3 py-2 text-sm text-white"
                          />
                        </label>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-gray-700 bg-[#1f2937] p-4">
                    <h3 className="text-lg font-semibold text-white">Global Permissions</h3>
                    <div className="mt-3 space-y-2">
                      {GLOBAL_OPTIONS.filter((opt) => opt.value !== '*').map((opt) => {
                        const checked = globalKnown.includes(opt.value);

                        return (
                          <AppToggle
                            key={`global-${opt.value}`}
                            ariaLabel={opt.label}
                            checked={checked}
                            size="compact"
                            onChange={() =>
                              setGlobalKnown((current) => togglePermission(current, opt.value))
                            }
                            label={opt.label}
                            className={`w-full flex-row-reverse justify-between rounded border px-3 py-2 transition-colors ${
                              checked
                                ? 'border-[var(--color-cyan-400)]/50 bg-[#0050D7]/10'
                                : 'border-gray-700 bg-[#111827]'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </section>
                </div>

                <section className="rounded-lg border border-gray-700 bg-[#1f2937] p-4">
                  <h3 className="text-lg font-semibold text-white">Server access for this user</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Configure one server at a time with clear access status and actions
                  </p>

                  {membersError && (
                    <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                      {membersError}
                    </div>
                  )}

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-200">
                        Select server
                      </label>
                      <AppSelect
                        value={selectedServerId}
                        onChange={(nextValue) => setSelectedServerId(nextValue)}
                        options={servers.map((server) => ({
                          label: server.name,
                          value: server.id,
                        }))}
                        className="w-full rounded-lg border border-gray-700 bg-[#0b1220] px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div className="rounded-lg border border-gray-700/70 bg-[#111827] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400">Current access</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            selectedAccessUser
                              ? 'border-[var(--color-cyan-400)]/40 bg-[#0050D7]/10 text-[var(--color-cyan-400)]'
                              : 'border-gray-600 bg-[#0f172a] text-gray-300'
                          }`}
                        >
                          {selectedAccessUser
                            ? getAccessLevelLabel(selectedAccessUser.permissions)
                            : 'No access'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-200">
                        Set permissions for <span className="text-white">{selectedServerName}</span>
                      </p>
                      <p className="mt-2 text-sm font-medium text-gray-200">Quick presets</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <AppButton
                          type="button"
                          onClick={() => setAddMemberKnown([])}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            addMemberPerms.length === 0
                              ? 'border-[var(--color-cyan-400)] bg-[#0050D7]/20 text-[var(--color-cyan-400)]'
                              : 'border-gray-600 bg-[#111827] text-gray-300 hover:border-[var(--color-cyan-400)] hover:text-[var(--color-cyan-400)]'
                          }`}
                        >
                          No access
                        </AppButton>
                        {SERVER_PRESETS.map((preset) => {
                          const active = samePermissionSet(addMemberPerms, preset.permissions);
                          return (
                            <AppButton
                              key={`edit-preset-${preset.id}`}
                              type="button"
                              onClick={() => applyAddPreset(preset.id)}
                              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                                active
                                  ? 'border-[var(--color-cyan-400)] bg-[#0050D7]/20 text-[var(--color-cyan-400)]'
                                  : 'border-gray-600 bg-[#111827] text-gray-300 hover:border-[var(--color-cyan-400)] hover:text-[var(--color-cyan-400)]'
                              }`}
                            >
                              {preset.label}
                            </AppButton>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {SERVER_OPTIONS.map((opt) => {
                        const checked = isServerPermissionChecked(addMemberKnown, opt.value);

                        return (
                          <AppToggle
                            key={`server-opt-${opt.value}`}
                            ariaLabel={opt.label}
                            checked={checked}
                            size="compact"
                            onChange={() =>
                              setAddMemberKnown((current) =>
                                toggleServerPermission(current, opt.value)
                              )
                            }
                            label={opt.label}
                            className={`w-full flex-row-reverse justify-between rounded border px-3 py-2 transition-colors ${
                              checked
                                ? 'border-[var(--color-cyan-400)]/50 bg-[#0050D7]/10'
                                : 'border-gray-700 bg-[#111827]'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </section>

                <div className="flex items-center justify-end gap-2 border-t border-gray-800 pt-4">
                  <AppButton
                    type="button"
                    onClick={() => onOpenChange(false)}
                    disabled={isBusy}
                    className="rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-60"
                  >
                    Cancel
                  </AppButton>
                  <AppButton
                    type="button"
                    onClick={onSaveChanges}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2 rounded bg-[#0050D7] px-4 py-2 text-sm font-medium text-white hover:bg-[#157EEA] hover:text-white disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saveLoading ? 'Saving...' : 'Save changes'}
                  </AppButton>
                </div>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
