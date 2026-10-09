import { useEffect, useRef } from 'react';

/** Calls `onReturn` each time the person comes back to this page after leaving it: another tab or app was in front, or the window lost focus. */
export function useOnTabReturn(onReturn: () => void) {
  const latest = useRef(onReturn);

  useEffect(() => {
    latest.current = onReturn;
  }, [onReturn]);

  useEffect(() => {
    let isAway = document.visibilityState === 'hidden' || !document.hasFocus();
    const handleLeave = () => {
      isAway = true;
    };
    const handleBack = () => {
      if (document.visibilityState === 'hidden' || !isAway) {
        return;
      }

      isAway = false;
      latest.current();
    };
    const handleVisibility = () =>
      document.visibilityState === 'hidden' ? handleLeave() : handleBack();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleLeave);
    window.addEventListener('focus', handleBack);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleLeave);
      window.removeEventListener('focus', handleBack);
    };
  }, []);
}

export default useOnTabReturn;
