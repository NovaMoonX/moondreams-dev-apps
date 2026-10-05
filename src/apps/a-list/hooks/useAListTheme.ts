import { useEffect } from 'react';

import '@apps/a-list/a-list.css';

const THEME_CLASS = 'a-list-theme';

/** Themes the whole page, portaled modals and drawers included, only while A-List is mounted. */
export function useAListTheme() {
  useEffect(() => {
    document.documentElement.classList.add(THEME_CLASS);
    return () => document.documentElement.classList.remove(THEME_CLASS);
  }, []);
}
