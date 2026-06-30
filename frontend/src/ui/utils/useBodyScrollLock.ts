import { useEffect } from 'react';

/**
 * Locks html + body scroll while the modal/overlay is open.
 * Restores scroll position on close or unmount.
 */
export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';

    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
      body.style.position = '';
      body.style.top = '';
      body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [isLocked]);
}
