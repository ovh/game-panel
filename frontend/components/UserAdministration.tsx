import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '../utils/api';
import { CreateUserDialog } from './userAdministration/CreateUserDialog';
import { UserEditDialog } from './userAdministration/UserEditDialog';
import { ConfirmationModal } from './ConfirmationModal';
import { UsersPanel } from './userAdministration/UsersPanel';
import { AppButton } from '../src/ui/components';
import {
  MAX_USERS,
  ALL_PRESETS,
  globalPresetValues,
  normalizePermissions,
  samePermissionSet,
  sanitizeServerPermissions,
  serverPresetValues,
  splitPermissions,
  stripWildcard,
} from './userAdministration/utils';

interface UserAdministrationProps {
  servers: Array<{ id: string; name: string; provider?: string; catalogId?: string }>;
  currentUserId?: number | null;
  canManageUsers?: boolean;
}

interface PanelUser {
  id: number;
  username: string;
  isRoot: boolean;
  isEnabled: boolean;
  globalPermissions: string[];
}

interface ServerMember {
  id: number;
  serverId: number;
  userId: number;
  username: string;
  permissions: string[];
}

function apiError(error: any, fallback: string) {
  return error?.response?.data?.error || fallback;
}

export function UserAdministration({
  servers,
  currentUserId = null,
  canManageUsers = true,
}: UserAdministrationProps) {
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [globalKnown, setGlobalKnown] = useState<string[]>([]);
  const [saveEditLoading, setSaveEditLoading] = useState(false);
  const [deleteUserLoading, setDeleteUserLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const [selectedServerId, setSelectedServerId] = useState('');
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberKnown, setAddMemberKnown] = useState<string[]>([]);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<
    | { open: false }
    | {
        open: true;
        userId: number;
        username: string;
      }
  >({ open: false });

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  // Errors for the create/edit dialogs are shown inline inside the open modal,
  // not via the page-level `feedback` banner (which would render behind it).
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );
  const highlightedUserId = currentUserId ?? selectedUserId;
  const accessDenied = Boolean(usersError?.includes('users.manage'));

  const rootUserIds = useMemo(
    () => new Set(users.filter((u) => u.isRoot).map((u) => u.id)),
    [users]
  );
  const manageableMembers = useMemo(
    () => members.filter((m) => !rootUserIds.has(m.userId)),
    [members, rootUserIds]
  );
  const selectedAccessUser = useMemo(
    () => manageableMembers.find((m) => String(m.userId) === addMemberUserId) ?? null,
    [manageableMembers, addMemberUserId]
  );
  const userLimitReached = users.length >= MAX_USERS;

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await apiClient.listUsers();
      setUsers(res.users);
      setSelectedUserId((current) =>
        res.users.some((u) => u.id === current) ? current : (res.users[0]?.id ?? null)
      );
    } catch (error: any) {
      setUsers([]);
      setUsersError(
        apiError(error, 'Failed to load users.')
      );
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async (serverId: string) => {
    if (!serverId) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const res = await apiClient.getServerMembers(Number(serverId));
      setMembers(res.members);
    } catch (error: any) {
      setMembers([]);
      setMembersError(apiError(error, 'Failed to load server permissions.'));
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (servers.length === 0) return;
    setSelectedServerId((current) =>
      current && servers.some((s) => s.id === current) ? current : servers[0].id
    );
  }, [servers]);

  useEffect(() => {
    if (!selectedServerId || accessDenied) return;
    loadMembers(selectedServerId);
  }, [selectedServerId, accessDenied, loadMembers]);

  useEffect(() => {
    if (!selectedUser) return;
    setUsername(selectedUser.username);
    setEnabled(selectedUser.isEnabled);
    const basePerms = selectedUser.isRoot
      ? selectedUser.globalPermissions
      : stripWildcard(selectedUser.globalPermissions);
    const { known } = splitPermissions(basePerms, globalPresetValues);
    setGlobalKnown(known);
    setNewPassword('');
    setNewPasswordConfirm('');
  }, [selectedUser]);

  const allGlobalPerms = selectedUser?.isRoot
    ? normalizePermissions([...globalKnown])
    : stripWildcard(normalizePermissions([...globalKnown]));
  // Only ever send canonical per-server permissions (no `*`, no unknown
  // strings) — the backend now validates the array and rejects the whole
  // request with a 400 otherwise.
  const addMemberPerms = sanitizeServerPermissions(normalizePermissions([...addMemberKnown]));

  const resetCreateForm = useCallback(() => {
    setCreateUsername('');
    setCreatePassword('');
    setCreatePasswordConfirm('');
  }, []);

  const handleCreateUser = async () => {
    if (userLimitReached) {
      setCreateError(`User limit reached (${MAX_USERS} max).`);
      return;
    }
    const usernameValue = createUsername.trim();
    if (!usernameValue || !createPassword || !createPasswordConfirm) {
      setCreateError('Username and password are required.');
      return;
    }
    if (createPassword.length < 8) {
      setCreateError('Password must be at least 8 characters.');
      return;
    }
    if (createPassword !== createPasswordConfirm) {
      setCreateError('Password confirmation does not match.');
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await apiClient.createUser(
        usernameValue,
        createPassword,
        createPasswordConfirm
      );
      resetCreateForm();
      setCreateModalOpen(false);
      await loadUsers();
      if (typeof res.user?.id === 'number') {
        setSelectedUserId(res.user.id);
      }
      setFeedback({
        type: 'success',
        text: `User ${res.user?.username || usernameValue} created successfully.`,
      });
    } catch (error: any) {
      setCreateError(apiError(error, 'Failed to create user.'));
    } finally {
      setCreateLoading(false);
    }
  };

  useEffect(() => {
    if (!createModalOpen) return;
    setCreateError(null);
    resetCreateForm();
  }, [createModalOpen, resetCreateForm]);

  const handleSaveEdit = async () => {
    if (!selectedUser) return;
    if (selectedUser.isRoot) {
      setEditError('Super Admin account cannot be edited here.');
      return;
    }

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setEditError('Username is required.');
      return;
    }

    const shouldResetPassword = newPassword.length > 0 || newPasswordConfirm.length > 0;
    if (shouldResetPassword) {
      if (newPassword.length < 8) {
        setEditError('Password must be at least 8 characters.');
        return;
      }
      if (!newPasswordConfirm) {
        setEditError('Please confirm the new password.');
        return;
      }
      if (newPassword !== newPasswordConfirm) {
        setEditError('Password confirmation does not match.');
        return;
      }
    }

    setSaveEditLoading(true);
    setEditError(null);
    try {
      await apiClient.updateUser(selectedUser.id, {
        username: trimmedUsername,
        isEnabled: enabled,
        globalPermissions: stripWildcard(allGlobalPerms),
      });

      if (shouldResetPassword) {
        await apiClient.resetUserPassword(selectedUser.id, newPassword);
      }

      if (selectedServerId) {
        const selectedUserMember =
          members.find((member) => String(member.userId) === String(selectedUser.id)) ?? null;

        if (addMemberPerms.length === 0) {
          if (selectedUserMember) {
            await apiClient.removeServerMember(Number(selectedServerId), selectedUser.id);
          }
        } else if (!selectedUserMember) {
          await apiClient.addServerMember(Number(selectedServerId), selectedUser.id, addMemberPerms);
        } else if (!samePermissionSet(selectedUserMember.permissions, addMemberPerms)) {
          await apiClient.updateServerMember(
            Number(selectedServerId),
            selectedUser.id,
            addMemberPerms
          );
        }
      }

      await loadUsers();
      if (selectedServerId) {
        await loadMembers(selectedServerId);
      }
      setNewPassword('');
      setNewPasswordConfirm('');
      setEditModalOpen(false);
      setFeedback({ type: 'success', text: 'User changes saved successfully.' });
    } catch (error: any) {
      setEditError(apiError(error, 'Failed to save user changes.'));
    } finally {
      setSaveEditLoading(false);
    }
  };

  const requestDeleteUser = (user: PanelUser) => {
    if (user.isRoot) {
      setFeedback({ type: 'error', text: 'Super Admin account cannot be deleted.' });
      return;
    }
    setSelectedUserId(user.id);
    setDeleteUserConfirm({
      open: true,
      userId: user.id,
      username: user.username,
    });
  };

  const confirmDeleteUser = async () => {
    if (!deleteUserConfirm.open) return;
    const userId = deleteUserConfirm.userId;
    const usernameToDelete = deleteUserConfirm.username;

    setDeleteUserLoading(true);
    setFeedback(null);
    try {
      await apiClient.deleteUser(userId);
      await loadUsers();
      if (selectedServerId) await loadMembers(selectedServerId);
      setEditModalOpen(false);
      setFeedback({ type: 'success', text: `User ${usernameToDelete} deleted.` });
    } catch (error: any) {
      // Rethrow so ConfirmationModal surfaces the error inline and stays open.
      throw new Error(apiError(error, 'Failed to delete user.'));
    } finally {
      setDeleteUserLoading(false);
    }
  };

  useEffect(() => {
    if (!addMemberUserId) {
      setAddMemberKnown([]);
      return;
    }
    const existing = members.find((m) => String(m.userId) === addMemberUserId);
    if (!existing) {
      setAddMemberKnown([]);
      return;
    }
    const { known } = splitPermissions(existing.permissions, serverPresetValues);
    setAddMemberKnown(known);
  }, [addMemberUserId, members]);

  const applyAddPreset = (presetId: string) => {
    const preset = ALL_PRESETS.find((x) => x.id === presetId);
    if (!preset) return;
    setAddMemberKnown(normalizePermissions(preset.permissions));
  };

  const openUserEdit = (user: PanelUser) => {
    if (user.isRoot) {
      setFeedback({ type: 'error', text: 'Super Admin account cannot be edited here.' });
      return;
    }
    setEditError(null);
    setSelectedUserId(user.id);
    setAddMemberUserId(String(user.id));
    setUsername(user.username);
    setEnabled(user.isEnabled);
    const basePerms = user.isRoot ? user.globalPermissions : stripWildcard(user.globalPermissions);
    const { known } = splitPermissions(basePerms, globalPresetValues);
    setGlobalKnown(known);
    setNewPassword('');
    setNewPasswordConfirm('');
    // Reset server permissions from current server state to avoid stale state
    // when reopening the dialog for the same user without saving.
    const existingMember = members.find((m) => String(m.userId) === String(user.id));
    if (!existingMember) {
      setAddMemberKnown([]);
    } else {
      const { known: memberKnown } = splitPermissions(existingMember.permissions, serverPresetValues);
      setAddMemberKnown(memberKnown);
    }
    setEditModalOpen(true);
  };

  if (!canManageUsers) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-[1140px] space-y-6">
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-green-600/40 bg-green-500/10 text-green-700 dark:text-green-300' : 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300'}`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <span>{feedback.text}</span>
          </div>
        </div>
      )}

      {usersError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div className="space-y-2">
              <p className="text-sm">{usersError}</p>
              <AppButton
                onClick={loadUsers}
                className="inline-flex items-center gap-2 rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-500"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {!accessDenied && (
        <>
          <CreateUserDialog
            open={createModalOpen}
            onOpenChange={(open) => {
              setCreateModalOpen(open);
              if (!open) {
                setCreateError(null);
                if (!createLoading) {
                  resetCreateForm();
                }
              }
            }}
            createLoading={createLoading}
            userLimitReached={userLimitReached}
            createUsername={createUsername}
            setCreateUsername={setCreateUsername}
            createPassword={createPassword}
            setCreatePassword={setCreatePassword}
            createPasswordConfirm={createPasswordConfirm}
            setCreatePasswordConfirm={setCreatePasswordConfirm}
            onCreateUser={handleCreateUser}
            error={createError}
          />

          <UserEditDialog
            open={editModalOpen}
            onOpenChange={(open) => {
              setEditModalOpen(open);
              if (!open) {
                setNewPassword('');
                setNewPasswordConfirm('');
                setEditError(null);
                if (!deleteUserLoading) {
                  setDeleteUserConfirm({ open: false });
                }
              }
            }}
            selectedUser={
              selectedUser ? { id: selectedUser.id, isRoot: selectedUser.isRoot } : null
            }
            username={username}
            setUsername={setUsername}
            enabled={enabled}
            setEnabled={setEnabled}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            newPasswordConfirm={newPasswordConfirm}
            setNewPasswordConfirm={setNewPasswordConfirm}
            globalKnown={globalKnown}
            setGlobalKnown={setGlobalKnown}
            selectedServerId={selectedServerId}
            setSelectedServerId={setSelectedServerId}
            servers={servers}
            selectedAccessUser={selectedAccessUser}
            addMemberPerms={addMemberPerms}
            addMemberKnown={addMemberKnown}
            setAddMemberKnown={setAddMemberKnown}
            applyAddPreset={applyAddPreset}
            membersError={membersError}
            onSaveChanges={handleSaveEdit}
            saveLoading={saveEditLoading}
            saveError={editError}
          />

          <ConfirmationModal
            isOpen={deleteUserConfirm.open}
            onClose={() => {
              if (deleteUserLoading) return;
              setDeleteUserConfirm({ open: false });
            }}
            onConfirm={confirmDeleteUser}
            title="Delete User"
            message={
              deleteUserConfirm.open
                ? `Delete "${deleteUserConfirm.username}" now? This action permanently deletes the account and cannot be undone.`
                : 'This action permanently deletes the account and cannot be undone.'
            }
            confirmText="Delete"
            confirmButtonClass="bg-red-600 hover:bg-red-700"
            requiredText={deleteUserConfirm.open ? deleteUserConfirm.username : undefined}
          />

          <UsersPanel
            users={users}
            usersLoading={usersLoading}
            userLimitReached={userLimitReached}
            highlightedUserId={highlightedUserId}
            maxUsers={MAX_USERS}
            setFeedback={setFeedback}
            setCreateModalOpen={setCreateModalOpen}
            openUserEdit={openUserEdit}
            requestDeleteUser={requestDeleteUser}
            deleteUserLoading={deleteUserLoading}
          />
        </>
      )}
    </div>
  );
}



