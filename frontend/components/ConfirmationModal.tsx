import { AlertTriangle, X } from 'lucide-react';
import { AppButton, AppModal, AppModalBody, AppModalContent, AppModalDescription, AppModalHeader, AppModalTitle } from '../src/ui/components';

interface ConfirmationModalProps {
  confirmButtonClass?: string;
  confirmText?: string;
  showCloseButton?: boolean;
  icon?: 'warning' | 'danger';
  isOpen: boolean;
  message: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  confirmButtonClass,
  showCloseButton = true,
  icon = 'warning',
}: ConfirmationModalProps) {
  const handleConfirm = () => {
    try {
      void onConfirm();
    } finally {
      onClose();
    }
  };

  return (
    <AppModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AppModalContent
        dismissible={false}
        className="z-[61] w-[calc(100%-2rem)] max-w-md rounded-lg p-4 md:p-6"
      >
        <AppModalBody>
          <div className="flex items-start gap-3 md:gap-4">
            <div
              className={`rounded-full p-2 md:p-3 ${icon === 'danger' ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}
            >
              <AlertTriangle
                className={`h-5 w-5 md:h-6 md:w-6 ${icon === 'danger' ? 'text-red-400' : 'text-yellow-400'}`}
              />
            </div>

            <div className="flex-1 min-w-0">
              <AppModalHeader className="mb-2">
                <AppModalTitle className="text-base md:text-lg">{title}</AppModalTitle>
              </AppModalHeader>
              <AppModalDescription className="mb-4 text-sm text-slate-300 md:mb-6">
                {message}
              </AppModalDescription>

              <div className="flex items-center gap-2 md:gap-3">
                <AppButton
                  type="button"
                  onClick={handleConfirm}
                  className={`inline-flex min-w-[132px] items-center justify-center rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                    confirmButtonClass || 'bg-[#0050D7] hover:bg-[#157EEA] hover:text-white'
                  }`}
                >
                  {confirmText || 'Confirm'}
                </AppButton>
                <AppButton
                  type="button"
                  onClick={onClose}
                  className="inline-flex min-w-[132px] items-center justify-center rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-60"
                >
                  Cancel
                </AppButton>
              </div>
            </div>

            {showCloseButton ? (
              <AppButton
                tone="ghost"
                onClick={onClose}
                className="h-8 w-8 p-0 text-slate-400 hover:text-red-400"
              >
                <X className="h-5 w-5" />
              </AppButton>
            ) : null}
          </div>
        </AppModalBody>
      </AppModalContent>
    </AppModal>
  );
}


