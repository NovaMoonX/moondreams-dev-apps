import { useEffect } from 'react';

import '@apps/pinch/pinch.css';

const THEME_CLASS = 'pinch-theme';

/** Themes the whole page, portaled modals and drawers included, only while Pinch is mounted. */
export function usePinchTheme() {
  useEffect(() => {
    document.documentElement.classList.add(THEME_CLASS);
    return () => document.documentElement.classList.remove(THEME_CLASS);
  }, []);
}
