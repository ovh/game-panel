import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
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
  requiredText?: string;
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
  requiredText,
}: ConfirmationModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setInputValue('');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  // Autofocus the type-to-confirm input so destructive confirmations are keyboard-ready.
  useEffect(() => {
    if (!isOpen || !requiredText) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen, requiredText]);

  const isConfirmAllowed = requiredText ? inputValue === requiredText : true;
  const matches = requiredText ? inputValue === requiredText : false;

  const handleConfirm = async () => {
    if (!isConfirmAllowed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Await the action so failures surface inline and the modal only closes on success
      // — previously it closed immediately and swallowed rejections (false "success").
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(
        err?.response?.data?.error || err?.message || 'Action failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
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
              <AppModalDescription className={`text-sm text-slate-300 ${requiredText ? 'mb-3' : 'mb-4 md:mb-6'}`}>
                {message}
              </AppModalDescription>

              {requiredText && (
                <div className="mb-4 md:mb-6">
                  <label className="mb-1.5 block text-xs text-gray-400">
                    Type <span className="font-semibold text-white">"{requiredText}"</span> to confirm
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleConfirm();
                    }}
                    onPaste={(e) => e.preventDefault()}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={submitting}
                    className={`w-full rounded-lg border bg-gray-800/80 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:ring-1 disabled:opacity-60 ${
                      matches
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30'
                        : 'border-gray-600 focus:border-gray-500 focus:ring-gray-500/20'
                    }`}
                    placeholder={requiredText}
                  />
                </div>
              )}

              {error && (
                <div className="mb-3 flex items-start gap-2 text-sm text-red-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-2 md:gap-3">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!isConfirmAllowed || submitting}
                  className={`inline-flex min-w-[132px] items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium !text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                    confirmButtonClass || 'bg-[var(--gp-primary-700)] hover:bg-[var(--gp-primary-600)]'
                  }`}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Working…' : confirmText || 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="inline-flex min-w-[132px] items-center justify-center rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>

            {showCloseButton ? (
              <AppButton
                tone="ghost"
                onClick={onClose}
                disabled={submitting}
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


