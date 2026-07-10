import { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { MAX_USERS } from './utils';
import { AppButton, AppInput } from '../../src/ui/components';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createLoading: boolean;
  userLimitReached: boolean;
  createUsername: string;
  setCreateUsername: (value: string) => void;
  createPassword: string;
  setCreatePassword: (value: string) => void;
  createPasswordConfirm: string;
  setCreatePasswordConfirm: (value: string) => void;
  onCreateUser: () => void;
  /** Error shown inline; the modal stays open on failure, so a page banner would be hidden. */
  error?: string | null;
}

export function CreateUserDialog({
  open,
  onOpenChange,
  createLoading,
  userLimitReached,
  createUsername,
  setCreateUsername,
  createPassword,
  setCreatePassword,
  createPasswordConfirm,
  setCreatePasswordConfirm,
  onCreateUser,
  error,
}: CreateUserDialogProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] sm:w-full max-h-[90vh] sm:max-w-[420px] overflow-hidden border border-gray-700/80 bg-[#0f172a] p-0 text-white">
        <div className="max-h-[90vh] overflow-y-auto hide-scrollbar modal-scrollbar-dark p-6 md:p-7">
          <DialogHeader className="border-b border-gray-800 pb-5 pr-8">
            <DialogTitle className="text-xl text-white">Create user</DialogTitle>
            <DialogDescription className="leading-relaxed text-gray-400">
              Create the account directly from the panel. The user is enabled immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-6">
            {userLimitReached && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Limit reached: maximum {MAX_USERS} users.
              </div>
            )}

            <div className="space-y-3">
              <AppInput
                value={createUsername}
                onChange={(event) => setCreateUsername(event.target.value)}
                placeholder="Username"
                name="new-user-username"
                autoComplete="off"
                className="prevent-autofill w-full rounded border border-gray-700 bg-[#1f2937] px-3 py-2 text-sm text-white focus:border-[var(--color-cyan-400)] focus:outline-none"
              />
              <div className="relative">
                <AppInput
                  value={createPassword}
                  onChange={(event) => setCreatePassword(event.target.value)}
                  placeholder="Password"
                  name="new-user-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  className="prevent-autofill w-full rounded border border-gray-700 bg-[#1f2937] px-3 py-2 pr-10 text-sm text-white focus:border-[var(--color-cyan-400)] focus:outline-none"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPassword(s => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <AppInput
                  value={createPasswordConfirm}
                  onChange={(event) => setCreatePasswordConfirm(event.target.value)}
                  placeholder="Confirm password"
                  name="new-user-password-confirm"
                  type={showPasswordConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  className="prevent-autofill w-full rounded border border-gray-700 bg-[#1f2937] px-3 py-2 pr-10 text-sm text-white focus:border-[var(--color-cyan-400)] focus:outline-none"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPasswordConfirm(s => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors">
                  {showPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-gray-800 pt-4 sm:flex-row">
              <AppButton
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={createLoading}
                className="flex-1 rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-60"
              >
                Cancel
              </AppButton>
              <AppButton
                type="button"
                tone="primary"
                onClick={onCreateUser}
                disabled={createLoading || userLimitReached}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {createLoading ? 'Creating...' : 'Create user'}
              </AppButton>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
