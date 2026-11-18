import { useEffect } from 'react';

import '@apps/helm/helm.css';
import { DEFAULT_HELM_THEME, HELM_THEMES } from '@apps/helm/constants';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import type { HelmTheme } from '@apps/helm/types';

const THEME_CLASS = 'helm-theme';
const THEME_ATTRIBUTE = 'data-helm-theme';
const CACHE_PREFIX = 'helm-theme:';

const isHelmTheme = (value: unknown): value is HelmTheme =>
  HELM_THEMES.some((option) => option.id === value);

/** The last theme this device showed, so the first paint is not the default while the profile loads. */
const readCachedTheme = (uid: string | undefined): HelmTheme | null => {
  if (!uid) return null;
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + uid);
    return isHelmTheme(cached) ? cached : null;
  } catch {
    return null;
  }
};

const writeCachedTheme = (uid: string, theme: HelmTheme) => {
  try {
    localStorage.setItem(CACHE_PREFIX + uid, theme);
  } catch {
    // Storage can be blocked; the profile still decides next load.
  }
};

/** The profile's theme once it has loaded: undefined while it hasn't, the default for a missing or unknown value. */
const readProfileTheme = (value: unknown): HelmTheme | undefined => {
  if (value === undefined) return undefined;
  return isHelmTheme(value) ? value : DEFAULT_HELM_THEME;
};

/** Themes the whole page, portaled modals and drawers included, only while Helm is mounted. */
export function useHelmTheme() {
  const profileTheme = useAppSelector((state) =>
    readProfileTheme(state.helm.profile?.theme),
  );
  const { user } = useAuth();
  const uid = user?.uid;
  const theme = profileTheme ?? readCachedTheme(uid);

  useEffect(() => {
    document.documentElement.classList.add(THEME_CLASS);
    return () => document.documentElement.classList.remove(THEME_CLASS);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === null || theme === DEFAULT_HELM_THEME) {
      root.removeAttribute(THEME_ATTRIBUTE);
    } else {
      root.setAttribute(THEME_ATTRIBUTE, theme);
    }
    if (uid && profileTheme) writeCachedTheme(uid, profileTheme);
    return () => root.removeAttribute(THEME_ATTRIBUTE);
  }, [theme, profileTheme, uid]);
}
