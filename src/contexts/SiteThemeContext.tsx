import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  ThemeContext,
  type Theme,
  type ThemeContextValue,
} from '@moondreamsdev/dreamer-ui/hooks';

/** Read before first paint by the inline script in `index.html`; keep the two in step. */
export const THEME_STORAGE_KEY = 'moondreams-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

const readStoredTheme = (): Theme => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.find((theme) => theme === stored) ?? 'system';
  } catch {
    return 'system';
  }
};

const storeTheme = (theme: Theme) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice still holds for this visit.
  }
};

// A phone can switch appearance while the site sits in the background (iOS's
// automatic light/dark), and a backgrounded page or home-screen app may never
// get the `change` event, so the device is read again whenever the page returns.
const subscribeToDevice = (onChange: () => void) => {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  document.addEventListener('visibilitychange', onChange);
  window.addEventListener('pageshow', onChange);
  window.addEventListener('focus', onChange);
  return () => {
    query.removeEventListener('change', onChange);
    document.removeEventListener('visibilitychange', onChange);
    window.removeEventListener('pageshow', onChange);
    window.removeEventListener('focus', onChange);
  };
};

const readDeviceIsDark = () => window.matchMedia(DARK_QUERY).matches;

const resolveTheme = (theme: Theme, isDeviceDark: boolean) => {
  if (theme === 'system') {
    return isDeviceDark ? 'dark' : 'light';
  }
  return theme;
};

const applyBrowserColor = (theme: Theme, resolved: 'light' | 'dark') => {
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      const deviceMedia = meta.dataset.deviceMedia ?? meta.media;
      meta.dataset.deviceMedia = deviceMedia;
      if (theme === 'system') {
        meta.media = deviceMedia;
        return;
      }
      meta.media = deviceMedia.includes(resolved) ? 'all' : 'not all';
    });
};

/** The site's theme: Auto (follows the device, the default), Light or Dark, remembered on this device and served through Dreamer UI's `useTheme`. */
export function SiteThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const isDeviceDark = useSyncExternalStore(
    subscribeToDevice,
    readDeviceIsDark,
    () => false,
  );

  const resolvedTheme = resolveTheme(theme, isDeviceDark);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        setThemeState(readStoredTheme());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.setAttribute('data-theme', resolvedTheme);
    applyBrowserColor(theme, resolvedTheme);
  }, [theme, resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    storeTheme(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      toggleTheme: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    }),
    [theme, setTheme, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
