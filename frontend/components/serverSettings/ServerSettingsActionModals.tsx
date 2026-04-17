import { AlertTriangle, X } from 'lucide-react';
import { AppButton, AppInput } from '../../src/ui/components';

interface DeleteEntryTarget {
  name: string;
  type: 'file' | 'folder' | 'symlink';
}

interface ServerSettingsActionModalsProps {
  modalBg: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  hoverBg: string;
  inputBg: string;
  inputBorder: string;
  showCreateEntryModal: boolean;
  createEntryType: 'file' | 'folder';
  createEntryName: string;
  createEntryError: string | null;
  createEntryLoading: boolean;
  setCreateEntryName: (value: string) => void;
  clearCreateEntryError: () => void;
  closeCreateEntryModal: () => void;
  submitCreateEntry: () => Promise<void> | void;
  showDeleteEntryModal: boolean;
  deleteEntryTarget: DeleteEntryTarget | null;
  deleteEntryLoading: boolean;
  closeDeleteEntryModal: () => void;
  confirmDeleteEntry: () => Promise<void> | void;
  showBackupNowWarningModal: boolean;
  backupNowLoading: boolean;
  stopOnBackup: boolean;
  closeBackupWarningModal: () => void;
  executeBackupNow: () => Promise<void>;
}

export function ServerSettingsActionModals({
  modalBg,
  borderColor,
  textPrimary,
  textSecondary,
  hoverBg,
  inputBg,
  inputBorder,
  showCreateEntryModal,
  createEntryType,
  createEntryName,
  createEntryError,
  createEntryLoading,
  setCreateEntryName,
  clearCreateEntryError,
  closeCreateEntryModal,
  submitCreateEntry,
  showDeleteEntryModal,
  deleteEntryTarget,
  deleteEntryLoading,
  closeDeleteEntryModal,
  confirmDeleteEntry,
  showBackupNowWarningModal,
  backupNowLoading,
  stopOnBackup,
  closeBackupWarningModal,
  executeBackupNow,
}: ServerSettingsActionModalsProps) {
  const handleCreateClose = () => {
    if (createEntryLoading) return;
    closeCreateEntryModal();
    clearCreateEntryError();
  };

  const handleDeleteClose = () => {
    if (deleteEntryLoading) return;
    closeDeleteEntryModal();
  };

  return (
    <>
      {showCreateEntryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div
            className={`${modalBg} border ${borderColor} rounded-lg shadow-xl max-w-md w-full p-6`}
          >
            <div className="flex items-center justify-between gap-3 mb-5">
              <h3 className={`text-lg font-semibold ${textPrimary}`}>
                {createEntryType === 'folder' ? 'Create folder' : 'Create file'}
              </h3>
              <AppButton
                type="button"
                onClick={handleCreateClose}
                className={`p-2 rounded ${hoverBg} transition-colors ${textSecondary} hover:text-red-400`}
              >
                <X className="w-5 h-5" />
              </AppButton>
            </div>

            <div className="space-y-3">
              <label className={`block text-sm ${textSecondary}`}>
                {createEntryType === 'folder' ? 'Folder name' : 'File name'}
              </label>
              <AppInput
                type="text"
                value={createEntryName}
                onChange={(event) => {
                  setCreateEntryName(event.target.value);
                  clearCreateEntryError();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void submitCreateEntry();
                  }
                }}
                className={`w-full px-4 py-2.5 ${inputBg} border ${inputBorder} rounded-lg ${textPrimary} focus:outline-none focus:border-[var(--color-cyan-400)]`}
                placeholder={createEntryType === 'folder' ? 'example-folder' : 'example.txt'}
                autoFocus
              />
              {createEntryError && <div className="text-sm text-red-400">{createEntryError}</div>}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <AppButton
                type="button"
                onClick={handleCreateClose}
                className="rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-60"
                disabled={createEntryLoading}
              >
                Cancel
              </AppButton>
              <AppButton
                type="button"
                onClick={() => void submitCreateEntry()}
                disabled={createEntryLoading}
                className="rounded bg-[#0050D7] px-4 py-2 text-sm font-medium text-white hover:bg-[#157EEA] hover:text-white disabled:opacity-60"
              >
                {createEntryLoading ? 'Creating...' : 'Create'}
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {showDeleteEntryModal && deleteEntryTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div
            className={`${modalBg} border ${borderColor} rounded-lg shadow-xl max-w-md w-full p-6`}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className={`text-lg font-semibold ${textPrimary}`}>
                Delete {deleteEntryTarget.type}
              </h3>
              <AppButton
                type="button"
                onClick={handleDeleteClose}
                className={`p-2 rounded ${hoverBg} transition-colors ${textSecondary} hover:text-red-400`}
              >
                <X className="w-5 h-5" />
              </AppButton>
            </div>

            <p className={`text-sm ${textSecondary}`}>
              Are you sure you want to delete{' '}
              <span className={`font-medium ${textPrimary}`}>{deleteEntryTarget.name}</span>?
            </p>

            <div className="mt-6 flex items-center justify-end gap-2">
              <AppButton
                type="button"
                onClick={handleDeleteClose}
                className="rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-60"
                disabled={deleteEntryLoading}
              >
                Cancel
              </AppButton>
              <AppButton
                type="button"
                onClick={() => void confirmDeleteEntry()}
                disabled={deleteEntryLoading}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
              >
                {deleteEntryLoading ? 'Deleting...' : 'Delete'}
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {showBackupNowWarningModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div
            className={`${modalBg} border ${borderColor} rounded-lg shadow-xl max-w-md w-full p-6`}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Backup confirmation</h3>
              <AppButton
                type="button"
                onClick={closeBackupWarningModal}
                className={`p-2 rounded ${hoverBg} transition-colors ${textSecondary} hover:text-red-400`}
              >
                <X className="w-5 h-5" />
              </AppButton>
            </div>

            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className={`text-sm ${textSecondary}`}>
                {stopOnBackup ? (
                  <>
                    The server is not fully stopped and{' '}
                    <span className={`font-medium ${textPrimary}`}>Stop server before backup</span>{' '}
                    is enabled. Starting this backup will stop the server first. Do you want to
                    continue?
                  </>
                ) : (
                  <>
                    The server is not fully stopped and{' '}
                    <span className={`font-medium ${textPrimary}`}>Stop server before backup</span>{' '}
                    is disabled. Backup will run while the server is still active, which may produce
                    inconsistent data. Do you want to continue?
                  </>
                )}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <AppButton
                type="button"
                onClick={closeBackupWarningModal}
                className="rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-60"
                disabled={backupNowLoading}
              >
                Cancel
              </AppButton>
              <AppButton
                type="button"
                onClick={async () => {
                  closeBackupWarningModal();
                  await executeBackupNow();
                }}
                className="rounded bg-[#0050D7] px-4 py-2 text-sm font-medium text-white hover:bg-[#157EEA] hover:text-white disabled:opacity-60"
                disabled={backupNowLoading}
              >
                {backupNowLoading ? 'Creating backup...' : 'Continue backup'}
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}



