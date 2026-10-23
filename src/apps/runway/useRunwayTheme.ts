import { useEffect } from 'react';

import '@apps/runway/runway.css';

const THEME_CLASS = 'runway-theme';

/** Themes the whole page, portaled modals and drawers included, only while Runway is mounted. */
export function useRunwayTheme() {
  useEffect(() => {
    document.documentElement.classList.add(THEME_CLASS);
    return () => document.documentElement.classList.remove(THEME_CLASS);
  }, []);
}
