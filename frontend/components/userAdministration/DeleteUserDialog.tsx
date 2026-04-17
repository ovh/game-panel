import { AlertTriangle, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { AppButton } from '../../src/ui/components';

interface DeleteUserDialogState {
  open: boolean;
  userId?: number;
  username?: string;
}

interface DeleteUserDialogProps {
  state: DeleteUserDialogState;
  deleteUserLoading: boolean;
  deleteUserError: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteUserDialog({
  state,
  deleteUserLoading,
  deleteUserError,
  onClose,
  onConfirm,
}: DeleteUserDialogProps) {
  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        if (deleteUserLoading) return;
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[94vw] sm:w-full sm:max-w-[520px] overflow-hidden border border-gray-700/80 bg-[#0f172a] p-0 text-white">
        <div className="p-5 sm:p-6">
          <DialogHeader className="border-b border-gray-800 pb-4 pr-8">
            <DialogTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-red-300" />
              Delete User
            </DialogTitle>
            <DialogDescription className="text-gray-400 leading-relaxed">
              This action permanently deletes the account and cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5">
            <p className="text-xs uppercase tracking-wide text-red-200/90">User to delete</p>
            <p className="mt-1 text-sm font-semibold text-red-100">
              {state.open && state.username ? state.username : 'Selected user'}
            </p>
          </div>

          {deleteUserError && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {deleteUserError}
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-gray-800 pt-4">
            <AppButton
              type="button"
              onClick={onClose}
              disabled={deleteUserLoading}
              className="rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-60"
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              onClick={onConfirm}
              disabled={deleteUserLoading}
              className="inline-flex items-center gap-2 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              {deleteUserLoading ? 'Deleting...' : 'Delete'}
            </AppButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}



