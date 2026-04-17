import type { ComponentProps, ReactNode } from 'react';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  type ModalBodyProp,
  type ModalContentProp,
  type ModalProp,
} from '@ovhcloud/ods-react';
import { cn } from '../utils/cn';

interface AppModalProps extends Omit<ModalProp, 'onOpenChange'> {
  children?: ReactNode;
  onOpenChange?: (open: boolean) => void;
}

export function AppModal({
  onOpenChange,
  backdropStyle,
  positionerStyle,
  ...props
}: AppModalProps) {
  return (
    <Modal
      {...props}
      backdropStyle={{
        backgroundColor: 'rgba(2, 6, 23, 0.78)',
        opacity: 1,
        ...backdropStyle,
      }}
      positionerStyle={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        ...positionerStyle,
      }}
      onOpenChange={(detail) => {
        onOpenChange?.(detail.open);
      }}
    />
  );
}

interface AppModalContentProps extends ModalContentProp {
  contentClassName?: string;
}

export function AppModalContent({
  className,
  dismissible = true,
  contentClassName,
  ...props
}: AppModalContentProps) {
  return (
    <ModalContent
      className={cn('gp-app-modal-content', className, contentClassName)}
      dismissible={dismissible}
      {...props}
    />
  );
}

export function AppModalHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <ModalHeader>
      <div className={cn('gp-app-modal-header', className)} {...props} />
    </ModalHeader>
  );
}

export function AppModalTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('gp-app-modal-title text-lg font-semibold', className)} {...props} />;
}

export function AppModalDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('gp-app-modal-description text-sm text-slate-300', className)} {...props} />;
}

export function AppModalBody({ className, ...props }: ModalBodyProp) {
  return <ModalBody className={cn('gp-app-modal-body', className)} {...props} />;
}

export function AppModalFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('gp-app-modal-footer flex justify-end gap-3', className)} {...props} />;
}
