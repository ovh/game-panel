import { useState, type Dispatch, type SetStateAction } from 'react';
import { AlertCircle, Eye, EyeOff, Save } from 'lucide-react';
import { X } from 'lucide-react';
import { Dialog, DialogContent } from '../ui/dialog';
import { AppButton, AppInput, AppSelect, AppToggle } from '../../src/ui/components';
import {
  BACKUP_OPTIONS,
  CS2_OVHCLOUD_OPTIONS,
  CS2_PRESETS,
  FILE_MANAGER_OPTIONS,
  GLOBAL_OPTIONS,
  HYTALE_OVHCLOUD_OPTIONS,
  HYTALE_PRESETS,
  MINECRAFT_OVHCLOUD_OPTIONS,
  MINECRAFT_PRESETS,
  SCHEDULED_TASKS_OPTIONS,
  SERVER_GENERAL_OPTIONS,
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
  servers: Array<{ id: string; name: string; provider?: string; catalogId?: string }>;
  selectedAccessUser: SelectedAccessUser | null;
  addMemberPerms: string[];
  addMemberKnown: string[];
  setAddMemberKnown: Dispatch<SetStateAction<string[]>>;
  applyAddPreset: (presetId: string) => void;
  membersError: string | null;
  onSaveChanges: () => void;
  saveLoading: boolean;
  /** Error shown inline inside the dialog. The modal stays open on failure, so
   *  a page-level banner would be hidden behind it. */
  saveError?: string | null;
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
  saveError,
}: UserEditDialogProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  const selectedServer = servers.find((server) => server.id === selectedServerId);
  const selectedServerName = selectedServer?.name || 'this server';
  const isOvhcloud = selectedServer?.provider === 'ovhcloud';
  const isCs2OvhcloudServer = isOvhcloud && selectedServer?.catalogId === 'counter-strike-2';
  const isMinecraftOvhcloudServer = isOvhcloud && (selectedServer?.catalogId?.includes('minecraft') ?? false);
  const isMinecraftWithAddons = isMinecraftOvhcloudServer && (
    selectedServer?.catalogId?.includes('paper') ||
    selectedServer?.catalogId?.includes('fabric') ||
    selectedServer?.catalogId?.includes('neoforge')
  );
  const isHytaleOvhcloudServer = isOvhcloud && selectedServer?.catalogId === 'hytale';
  const isExternalServer = selectedServer?.provider === 'external';
  const isBusy = saveLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dismissible={false} className="w-[94vw] sm:w-[86vw] lg:w-[68vw] xl:w-[62vw] max-h-[90vh] sm:max-w-[920px] xl:max-w-[980px] overflow-hidden border border-gray-700/80 bg-[#0f172a] p-0 text-white">
        <div className="flex justify-end border-b border-gray-800 px-4 py-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(90vh-44px)] overflow-y-auto hide-scrollbar modal-scrollbar-dark p-4 md:p-5">

          {!selectedUser && <p className="pt-0 text-sm text-gray-400">No user selected.</p>}
          {selectedUser &&
            (selectedUser.isRoot ? (
              <div className="pt-0">
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  Super Admin account cannot be edited or deleted here.
                </div>
              </div>
            ) : (
              <div className="space-y-5 pt-0">
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
                          <div className="relative">
                            <AppInput
                              type={showPassword ? 'text' : 'password'}
                              name={`reset-password-${selectedUser.id}`}
                              autoComplete="new-password"
                              data-lpignore="true"
                              data-1p-ignore="true"
                              value={newPassword}
                              onChange={(event) => setNewPassword(event.target.value)}
                              placeholder="New password"
                              className="prevent-autofill w-full rounded border border-gray-700 bg-[#0f172a] px-3 py-2 pr-10 text-sm text-white"
                            />
                            <button type="button" tabIndex={-1} onClick={() => setShowPassword(s => !s)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors">
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-gray-200">
                            Retype new password
                          </span>
                          <div className="relative">
                            <AppInput
                              type={showPasswordConfirm ? 'text' : 'password'}
                              name={`reset-password-confirm-${selectedUser.id}`}
                              autoComplete="new-password"
                              data-lpignore="true"
                              data-1p-ignore="true"
                              value={newPasswordConfirm}
                              onChange={(event) => setNewPasswordConfirm(event.target.value)}
                              placeholder="Retype password"
                              className="prevent-autofill w-full rounded border border-gray-700 bg-[#0f172a] px-3 py-2 pr-10 text-sm text-white"
                            />
                            <button type="button" tabIndex={-1} onClick={() => setShowPasswordConfirm(s => !s)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors">
                              {showPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
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
                      {(() => {
                        const ADDON_PERMS = ['minecraft.addons.read', 'minecraft.addons.write'];
                        const filterAddons = (perms: string[]) =>
                          isMinecraftWithAddons ? perms : perms.filter((p) => !ADDON_PERMS.includes(p));
                        const gamePresets = isMinecraftOvhcloudServer
                          ? MINECRAFT_PRESETS.map((p) => ({ ...p, permissions: filterAddons(p.permissions) }))
                          : isHytaleOvhcloudServer ? HYTALE_PRESETS
                          : isCs2OvhcloudServer ? CS2_PRESETS
                          : null;
                        // Replace Viewer and Operator with game-enriched versions, keep Full access
                        const presetChips = !gamePresets
                          ? SERVER_PRESETS
                          : (() => {
                              const [gameViewer, gameOperator] = gamePresets;
                              return SERVER_PRESETS.map((p) =>
                                p.id === 'viewer' && gameViewer ? { ...gameViewer, label: p.label }
                                : p.id === 'operator' && gameOperator ? { ...gameOperator, label: p.label }
                                : p
                              );
                            })();
                        const noAccessActive = addMemberPerms.length === 0;
                        // "Custom" = the current permissions match neither "No access"
                        // nor any named preset chip shown above.
                        const customActive =
                          !noAccessActive &&
                          !presetChips.some((preset) => samePermissionSet(addMemberPerms, preset.permissions));
                        const chipBase = 'rounded-full border px-3 py-1.5 text-xs transition-colors';
                        const activeChip =
                          'gp-preset-active border-[var(--color-cyan-400)] bg-[#0050D7]/20 text-[var(--color-cyan-400)] ring-2 ring-[var(--color-cyan-400)]';
                        const idleChip =
                          'border-gray-600 bg-[#111827] text-gray-300 hover:border-[var(--color-cyan-400)] hover:text-[var(--color-cyan-400)]';
                        return (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <AppButton
                              type="button"
                              onClick={() => setAddMemberKnown([])}
                              className={`${chipBase} ${noAccessActive ? activeChip : idleChip}`}
                            >
                              No access
                            </AppButton>
                            {presetChips.map((preset) => {
                              const active = samePermissionSet(addMemberPerms, preset.permissions);
                              return (
                                <AppButton
                                  key={`edit-preset-${preset.id}`}
                                  type="button"
                                  onClick={() => applyAddPreset(preset.id)}
                                  className={`${chipBase} ${active ? activeChip : idleChip}`}
                                >
                                  {preset.label}
                                </AppButton>
                              );
                            })}
                            {/* Read-only status chip: highlighted only when the current
                                permissions don't match any preset above. */}
                            <AppButton
                              type="button"
                              aria-disabled="true"
                              tabIndex={-1}
                              className={`${chipBase} pointer-events-none cursor-default ${
                                customActive ? activeChip : `${idleChip} opacity-60`
                              }`}
                            >
                              Custom
                            </AppButton>
                          </div>
                        );
                      })()}
                    </div>

                    {/* General permissions */}
                    {[
                      { label: 'General', options: SERVER_GENERAL_OPTIONS },
                      { label: 'File Manager', options: FILE_MANAGER_OPTIONS },
                      { label: 'Scheduled Tasks', options: SCHEDULED_TASKS_OPTIONS },
                    ].map(({ label, options }) => (
                      <div key={label}>
                        <span className="mb-2 block text-xs font-medium text-gray-400">{label}</span>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {options.map((opt) => {
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
                    ))}

                    {/* Backups — masqué pour les images externes et CS2 (pas de backups) */}
                    {!isExternalServer && !isCs2OvhcloudServer && (
                      <div>
                        <span className="mb-2 block text-xs font-medium text-gray-400">Backups</span>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {BACKUP_OPTIONS.map((opt) => {
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
                    )}

                    {/* Minecraft — OVHcloud uniquement */}
                    {isMinecraftOvhcloudServer && (
                      <div>
                        <span className="mb-2 block text-xs font-medium text-gray-400">Minecraft</span>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {MINECRAFT_OVHCLOUD_OPTIONS.filter((opt) =>
                            isMinecraftWithAddons || (!opt.value.includes('addons'))
                          ).map((opt) => {
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
                    )}

                    {/* Hytale — OVHcloud uniquement */}
                    {isHytaleOvhcloudServer && (
                      <div>
                        <span className="mb-2 block text-xs font-medium text-gray-400">Hytale</span>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {HYTALE_OVHCLOUD_OPTIONS.map((opt) => {
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
                    )}

                    {/* Counter-Strike 2 — OVHcloud uniquement */}
                    {isCs2OvhcloudServer && (
                      <div>
                        <span className="mb-2 block text-xs font-medium text-gray-400">Counter-Strike 2</span>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {CS2_OVHCLOUD_OPTIONS.map((opt) => {
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
                    )}
                  </div>
                </section>

                <div className="flex flex-col gap-3 border-t border-gray-800 pt-4 sm:flex-row sm:items-center sm:justify-end">
                  {saveError && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 sm:mr-auto">
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{saveError}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2">
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
                    tone="primary"
                    onClick={onSaveChanges}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saveLoading ? 'Saving...' : 'Save changes'}
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
