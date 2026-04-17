import type { Dispatch, SetStateAction } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { AppButton, AppSelect, AppToggle } from '../../src/ui/components';
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

interface UserPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: SelectedUserRef | null;
  membersError: string | null;
  savePermissionsLoading: boolean;
  handleSaveGlobalPermissions: () => Promise<void>;
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
  handleAddMember: () => Promise<void>;
  addMemberLoading: boolean;
  deleteMemberLoading: boolean;
  onRequestRemoveAccess: (userId: number, username: string) => void;
}

export function UserPermissionsDialog({
  open,
  onOpenChange,
  selectedUser,
  membersError,
  savePermissionsLoading,
  handleSaveGlobalPermissions,
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
  handleAddMember,
  addMemberLoading,
  deleteMemberLoading,
  onRequestRemoveAccess,
}: UserPermissionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] sm:w-[84vw] lg:w-[64vw] xl:w-[56vw] max-h-[90vh] sm:max-w-[820px] xl:max-w-[880px] overflow-hidden border border-gray-700/80 bg-[#0f172a] p-0 text-white">
        <div className="max-h-[90vh] overflow-y-auto hide-scrollbar modal-scrollbar-dark p-6 md:p-7">
          <DialogHeader className="border-b border-gray-800 pb-6">
            <DialogTitle className="text-xl text-white">User permissions</DialogTitle>
            <DialogDescription className="text-gray-400 leading-relaxed">
              Manage global permissions and per-server access for this user.
            </DialogDescription>
          </DialogHeader>

          {!selectedUser && <p className="text-sm text-gray-400">No user selected.</p>}
          {selectedUser && (
            <div className="space-y-7">
              <div className="rounded-lg border border-gray-700 bg-[#1f2937] p-5">
                <div className="mb-4 rounded-lg border border-gray-700 bg-[#111827] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Global permissions</p>
                      <p className="text-xs text-gray-400">Manage panel-wide permissions for this user.</p>
                    </div>
                  </div>
                </div>
                <div className="mb-3 flex items-center justify-end gap-3">
                  {!selectedUser.isRoot && (
                    <AppButton
                      onClick={handleSaveGlobalPermissions}
                      disabled={savePermissionsLoading}
                      className="inline-flex items-center gap-2 rounded bg-[#0050D7] px-4 py-2 text-sm font-medium text-white hover:bg-[#157EEA] hover:text-white disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {savePermissionsLoading ? 'Saving...' : 'Save global permissions'}
                    </AppButton>
                  )}
                </div>
                {selectedUser.isRoot ? (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    Super Admin account has full global permissions.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {GLOBAL_OPTIONS.filter((opt) => opt.value !== '*').map((opt) => {
                      const checked = globalKnown.includes(opt.value);
                      return (
                        <AppToggle
                          key={`perm-${opt.value}`}
                          ariaLabel={opt.label}
                          checked={checked}
                          size="compact"
                          onChange={() =>
                            setGlobalKnown((current) => togglePermission(current, opt.value))
                          }
                          label={opt.label}
                          className={`w-full flex-row-reverse justify-between rounded border px-3 py-2 transition-colors ${
                            checked ? 'border-[var(--color-cyan-400)]/50 bg-[#0050D7]/10' : 'border-gray-700 bg-[#111827]'
                          }`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-700 bg-[#1f2937] p-5">
                <div className="mb-4 rounded-lg border border-gray-700 bg-[#111827] px-4 py-3">
                  <p className="text-sm font-semibold text-white">Server access for this user</p>
                  <p className="text-xs text-gray-400">
                    Configure one server at a time with clear access status and actions.
                  </p>
                </div>

                {membersError && (
                  <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {membersError}
                  </div>
                )}

                {selectedUser.isRoot ? (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    Super Admin always has full access on every server.
                  </p>
                ) : (
                  <div className="space-y-5">
                    <div className="rounded-lg border border-gray-700 bg-[#111827] p-4">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">
                        Step 1: Select game/server
                      </p>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                        <AppSelect
                          value={selectedServerId}
                          onChange={(nextValue) => setSelectedServerId(nextValue)}
                          options={servers.map((s) => ({
                            label: s.name,
                            value: s.id,
                          }))}
                          className="w-full rounded-lg border border-gray-700 bg-[#0b1220] px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
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
                      <span className="mb-2 block text-[11px] uppercase tracking-wide text-gray-500">
                        Step 2: Permissions
                      </span>
                      <span className="mb-3 block text-xs font-medium text-gray-300">Quick presets</span>
                      <div className="flex flex-wrap gap-2">
                        {SERVER_PRESETS.map((preset) => {
                          const active = samePermissionSet(addMemberPerms, preset.permissions);
                          return (
                            <AppButton
                              key={`modal-${preset.id}`}
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

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {SERVER_OPTIONS.map((opt) => {
                        const checked = isServerPermissionChecked(addMemberKnown, opt.value);
                        return (
                          <AppToggle
                            key={`modal-opt-${opt.value}`}
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
                              checked ? 'border-[var(--color-cyan-400)]/50 bg-[#0050D7]/10' : 'border-gray-700 bg-[#111827]'
                            }`}
                          />
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap gap-3 pt-1">
                      <AppButton
                        onClick={handleAddMember}
                        disabled={addMemberLoading}
                        className="inline-flex items-center gap-2 rounded bg-[#0050D7] px-4 py-2 text-sm font-medium text-white hover:bg-[#157EEA] hover:text-white disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        {addMemberLoading
                          ? selectedAccessUser
                            ? 'Saving...'
                            : 'Adding...'
                          : selectedAccessUser
                            ? 'Save access'
                            : 'Add access'}
                      </AppButton>
                      {selectedAccessUser && (
                        <AppButton
                          onClick={() =>
                            onRequestRemoveAccess(selectedAccessUser.userId, selectedAccessUser.username)
                          }
                          disabled={deleteMemberLoading}
                          className="inline-flex items-center gap-2 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" />
                          {deleteMemberLoading ? 'Removing...' : 'Remove access'}
                        </AppButton>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}



