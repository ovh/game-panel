import { useEffect, useState } from 'react';
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react';
import { apiClient } from '../utils/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { AppAlert, AppButton, AppFormField, AppInput } from '../src/ui/components';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
    setIsSubmitting(false);
  }, [isOpen]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedCurrentPassword = currentPassword.trim();
    const trimmedNewPassword = newPassword.trim();
    const trimmedConfirmPassword = confirmPassword.trim();

    if (!trimmedCurrentPassword || !trimmedNewPassword || !trimmedConfirmPassword) {
      setError('All password fields are required.');
      setSuccess(null);
      return;
    }

    if (trimmedNewPassword.length < 8) {
      setError('The new password must contain at least 8 characters.');
      setSuccess(null);
      return;
    }

    if (trimmedNewPassword !== trimmedConfirmPassword) {
      setError('The new password confirmation does not match.');
      setSuccess(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.changePassword(
        trimmedCurrentPassword,
        trimmedNewPassword,
        trimmedConfirmPassword
      );
      setSuccess('Password updated successfully.');
      window.setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[94vw] sm:w-[84vw] lg:w-[64vw] xl:w-[56vw] max-h-[90vh] sm:max-w-[520px] xl:max-w-[520px] overflow-hidden border border-gray-700/80 bg-[#0f172a] p-0 text-white">
        <div className="max-h-[90vh] overflow-y-auto hide-scrollbar modal-scrollbar-dark p-6 md:p-7">
          <DialogHeader className="border-b border-gray-800 pb-6">
            <DialogTitle className="text-xl text-white">Change password</DialogTitle>
            <DialogDescription className="text-gray-400 leading-relaxed">
              Update the password of the currently authenticated user.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-6">
            {error && (
              <AppAlert tone="critical" className="text-sm">
                <span className="flex items-start gap-2 text-red-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </span>
              </AppAlert>
            )}

            {success && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-200">
                {success}
              </div>
            )}

            <AppFormField className="space-y-2" label="Current password" required>
              <AppInput
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-700 bg-[#1f2937] px-3 py-2 text-sm text-white focus:border-[var(--color-cyan-400)] focus:outline-none"
              />
            </AppFormField>

            <AppFormField className="space-y-2" label="New password" required>
              <AppInput
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-700 bg-[#1f2937] px-3 py-2 text-sm text-white focus:border-[var(--color-cyan-400)] focus:outline-none"
              />
            </AppFormField>

            <AppFormField className="space-y-2" label="Confirm new password" required>
              <AppInput
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-700 bg-[#1f2937] px-3 py-2 text-sm text-white focus:border-[var(--color-cyan-400)] focus:outline-none"
              />
            </AppFormField>

            <div className="flex items-center justify-end gap-2 border-t border-gray-800 pt-4">
              <AppButton
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-60"
              >
                Cancel
              </AppButton>
              <AppButton
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded bg-[#0050D7] px-4 py-2 text-sm font-medium text-white hover:bg-[#157EEA] hover:text-white disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                {isSubmitting ? 'Saving...' : 'Update password'}
              </AppButton>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}


