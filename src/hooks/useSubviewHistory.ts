import { useEffect, useRef } from 'react';
import { generateUuid } from '@/utils/idUtils';

/**
 * Gives a subview its own history entry, so the browser's or phone's back gesture closes the
 * subview instead of leaving the page underneath it. The entry copies the router's own state so
 * the router sees it as the same location.
 */
export function useSubviewHistory(onClose: () => void) {
  const onCloseRef = useRef(onClose);
  const keyRef = useRef(generateUuid());
  const isMountedRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const key = keyRef.current;
    const isOurEntry = () => window.history.state?.subviewKey === key;
    isMountedRef.current = true;

    if (!isOurEntry()) {
      window.history.pushState({ ...window.history.state, subviewKey: key }, '');
    }

    const handlePop = () => {
      if (!isOurEntry()) {
        onCloseRef.current();
      }
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
