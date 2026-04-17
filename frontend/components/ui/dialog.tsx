import type { ComponentProps } from 'react';
import { AppModal, AppModalContent, AppModalDescription, AppModalHeader, AppModalTitle } from '../../src/ui/components';

function Dialog({ ...props }: ComponentProps<typeof AppModal>) {
  return <AppModal {...props} />;
}

function DialogContent({ className, ...props }: ComponentProps<typeof AppModalContent>) {
  return <AppModalContent className={className} dismissible {...props} />;
}

function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <AppModalHeader className={className} {...props} />;
}

function DialogTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <AppModalTitle className={className} {...props} />;
}

function DialogDescription({ className, ...props }: ComponentProps<'p'>) {
  return <AppModalDescription className={className} {...props} />;
}

export { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle };

