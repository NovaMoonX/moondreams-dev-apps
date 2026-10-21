import { useEffect, useRef } from 'react';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import { generateUuid } from '@/utils/idUtils';

/**
 * Gives a subview its own history entry, so the browser's or phone's back gesture steps back
 * (`onBack`) or closes the subview instead of leaving the page underneath it, and a drawer opened
 * over it takes the gesture first. The entry copies the router's own state so the router sees it as
 * the same location.
 */
export function useSubviewHistory(onClose: () => void, onBack?: () => void) {
  const onCloseRef = useRef(onClose);
  const onBackRef = useRef(onBack);
  const keyRef = useRef(generateUuid());
  const isMountedRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
    onBackRef.current = onBack;
  });

  useEffect(() => {
    const key = keyRef.current;
    const isOurEntry = () => window.history.state?.subviewKey === key;
    isMountedRef.current = true;

    const restoreEntry = () =>
      window.history.pushState(
        { ...window.history.state, subviewKey: key },
        '',
      );

    if (!isOurEntry()) {
      restoreEntry();
    }

    const handlePop = () => {
      if (isOurEntry()) {
        return;
      }
      if (hasDialogOnTop()) {
        restoreEntry();
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
        return;
      }
      if (onBackRef.current) {
        restoreEntry();
        onBackRef.current();
        return;
      }
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePop);

    return () => {
      window.removeEventListener('popstate', handlePop);
      isMountedRef.current = false;
      // Deferred so Strict Mode's immediate remount keeps the entry instead of popping it.
      window.setTimeout(() => {
        if (!isMountedRef.current && isOurEntry()) {
          window.history.back();
        }
      }, 0);
    };
  }, []);
}
