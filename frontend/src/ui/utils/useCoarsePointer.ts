import { useEffect, useState } from 'react';

/**
 * Returns true on coarse-pointer (touch) devices — phones and tablets.
 *
 * Used to swap double-click interactions for single taps and to disable native
 * HTML5 drag, which is unsupported on iOS and can swallow taps when set on a row.
 */
export function useCoarsePointer(): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [coarse, setCoarse] = useState(() =>
    supported ? window.matchMedia('(pointer: coarse)').matches : false
  );

  useEffect(() => {
    if (!supported) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [supported]);

  return coarse;
}
