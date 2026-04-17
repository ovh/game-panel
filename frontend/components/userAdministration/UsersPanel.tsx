import { Plus, Settings2, Shield, Trash2, Users } from 'lucide-react';
import { AppButton } from '../../src/ui/components';

interface PanelUserListItem {
  id: number;
  username: string;
  isRoot: boolean;
  isEnabled: boolean;
  globalPermissions: string[];
}

interface UsersPanelProps {
  users: PanelUserListItem[];
  usersLoading: boolean;
  userLimitReached: boolean;
  highlightedUserId: number | null;
  maxUsers: number;
  setFeedback: (feedback: { type: 'success' | 'error'; text: string } | null) => void;
  setCreateModalOpen: (open: boolean) => void;
  openUserEdit: (user: PanelUserListItem) => void;
  requestDeleteUser: (user: PanelUserListItem) => void;
  deleteUserLoading: boolean;
}

export function UsersPanel({
  users,
  usersLoading,
  userLimitReached,
  highlightedUserId,
  maxUsers,
  setFeedback,
  setCreateModalOpen,
  openUserEdit,
  requestDeleteUser,
  deleteUserLoading,
}: UsersPanelProps) {
  return (
    <section className="rounded-xl border border-gray-800 bg-[#111827] p-5 md:p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
            <Users className="h-5 w-5 text-[var(--color-cyan-400)]" />
            Users
          </h2>
          {userLimitReached && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
              Max {maxUsers}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <AppButton
            onClick={() => {
              if (userLimitReached) {
                setFeedback({
                  type: 'error',
                  text: `User limit reached (${maxUsers} max).`,
                });
                return;
              }
              setFeedback(null);
              setCreateModalOpen(true);
            }}
            disabled={userLimitReached}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--color-cyan-400)]/55 bg-[#0b1728] px-4 text-sm font-semibold text-[var(--color-cyan-400)] transition-colors hover:border-[var(--color-cyan-400)] hover:text-[var(--color-cyan-400)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create user
          </AppButton>
        </div>
      </div>

      <div className="space-y-3">
        {users.length === 0 && !usersLoading && <p className="text-sm text-gray-400">No users found.</p>}

        {users.map((u) => (
          <div
            key={u.id}
            className={`w-full rounded-lg border px-4 py-4 transition-colors ${
              highlightedUserId === u.id
                ? 'border-gray-600 bg-[#152238]'
                : 'border-gray-700 bg-[#1f2937] hover:border-gray-500'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-600 bg-[#1f2937] text-sm font-semibold uppercase text-gray-200">
                  {u.username.charAt(0)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{u.username}</span>
                    {u.isRoot && (
                      <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                        <Shield className="h-3.5 w-3.5" />
                        Super Admin
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-gray-400">
                    {u.isEnabled ? 'Account enabled' : 'Account disabled'}
                  </p>
                </div>
              </div>
              {!u.isRoot && (
                <div className="flex items-center gap-3">
                  <AppButton
                    type="button"
                    onClick={() => openUserEdit(u)}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-gray-600 bg-[#111827] px-3.5 text-sm text-gray-200 hover:border-[var(--color-cyan-400)] hover:text-[var(--color-cyan-400)]"
                  >
                    <Settings2 className="h-4 w-4" />
                    Edit
                  </AppButton>
                  <AppButton
                    type="button"
                    onClick={() => requestDeleteUser(u)}
                    disabled={deleteUserLoading}
                    aria-label={`Delete user ${u.username}`}
                    title={`Delete user ${u.username}`}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-500/45 bg-[#2a1219] text-sm text-red-200 hover:border-red-400 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                  </AppButton>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}



