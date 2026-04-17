import { X, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { AppAlert, AppButton, AppFormField, AppInput, AppModal, AppModalBody, AppModalContent, AppModalDescription, AppModalFooter, AppModalHeader, AppModalTitle } from '../src/ui/components';

interface ForceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  serverName?: string;
  serverGame?: string;
}

export function ForceUpdateModal({ isOpen, onClose, onConfirm }: ForceUpdateModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const confirmKeyword = 'FORCE UPDATE';

  const handleConfirm = () => {
    if (confirmText === confirmKeyword) {
      if (onConfirm) {
        onConfirm();
      }
      setConfirmText('');
      onClose();
    }
  };

  return (
    <AppModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AppModalContent className="w-full max-w-lg rounded-lg border-2 border-red-500/50 shadow-2xl">
        <AppModalHeader className="flex items-center justify-between border-b border-red-500/30 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <AppModalTitle className="text-xl font-bold text-white">Force Update Server</AppModalTitle>
          </div>
          <AppButton
            tone="ghost"
            onClick={() => {
              onClose();
              setConfirmText('');
            }}
            className="rounded border-none bg-transparent p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-red-400"
          >
            <X className="w-5 h-5" />
          </AppButton>
        </AppModalHeader>

        <AppModalBody className="space-y-6 p-6">
          <AppAlert tone="critical" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <h4 className="text-base font-semibold text-red-500 mb-3">
              Warning: this action is disruptive
            </h4>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">*</span>
                <span>The server will restart immediately.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">*</span>
                <span>Connected players will be disconnected.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">*</span>
                <span>Incompatible mods/plugins can break after update.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">*</span>
                <span>Interrupting the process may corrupt data.</span>
              </li>
            </ul>
          </AppAlert>

          <div>
            <AppFormField label={`Type to confirm: ${confirmKeyword}`} className="text-white" required>
              <AppInput
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirmKeyword}
                className={`w-full px-4 py-3 bg-[#1f2937] border-2 ${
                  confirmText === confirmKeyword ? 'border-red-500' : 'border-gray-600'
                } rounded-lg text-white font-mono focus:outline-none focus:border-red-500`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm();
                }}
              />
            </AppFormField>
          </div>

          <AppModalDescription className="text-center text-xs text-gray-400">
            A full backup is strongly recommended before forcing an update.
          </AppModalDescription>
        </AppModalBody>

        <AppModalFooter className="flex items-center gap-3 border-t border-gray-700 p-6">
          <AppButton
            tone="neutral"
            onClick={() => {
              onClose();
              setConfirmText('');
            }}
            className="flex-1 px-6 py-3 rounded-lg font-medium transition-colors bg-gray-700 hover:bg-gray-600 text-white"
          >
            Cancel
          </AppButton>
          <AppButton
            tone="critical"
            disabled={confirmText !== confirmKeyword}
            onClick={handleConfirm}
            className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-colors ${
              confirmText === confirmKeyword
                ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                : 'bg-gray-400 text-gray-600 cursor-not-allowed'
            }`}
          >
            Force Update
          </AppButton>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}


