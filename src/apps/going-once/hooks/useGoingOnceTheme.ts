import { useEffect } from 'react';

import '@apps/going-once/going-once.css';

const THEME_CLASS = 'going-once-theme';

/** Themes the whole page, portaled modals and drawers included, only while Going Once is mounted. */
export function useGoingOnceTheme() {
  useEffect(() => {
    document.documentElement.classList.add(THEME_CLASS);
    return () => document.documentElement.classList.remove(THEME_CLASS);
  }, []);
}
