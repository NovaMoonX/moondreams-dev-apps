import { useEffect } from 'react';

import '@apps/helm/helm.css';

const THEME_CLASS = 'helm-theme';

/** Themes the whole page, portaled modals and drawers included, only while Helm is mounted. */
export function useHelmTheme() {
  useEffect(() => {
    document.documentElement.classList.add(THEME_CLASS);
    return () => document.documentElement.classList.remove(THEME_CLASS);
  }, []);
}
