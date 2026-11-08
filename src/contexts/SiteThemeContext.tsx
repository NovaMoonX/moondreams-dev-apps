import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  ThemeContext,
  type ThemeContextValue,
} from '@moondreamsdev/dreamer-ui/hooks';

import useOnTabReturn from '@/hooks/useOnTabReturn';
import {
  SiteThemeChoiceContext,
  type SiteTheme,
  type SiteThemeValue,
} from '@/hooks/useSiteTheme';
import {
  readSunPlace,
  resolveSunset,
  storeSunPlace,
  storeSunsetMinutes,
  SUN_PLACE_KEY,
  type SunPlace,
  type SunsetState,
} from '@/lib/theme/sunsetTheme';
import {
  getCurrentCoordinates,
  type Coordinates,
} from '@/utils/geolocationUtils';
import {
  getDeviceTimeZone,
  loadTimeZoneCoordinates,
} from '@/utils/timezoneUtils';

/** Read before first paint by the inline script in `index.html`; keep the two in step. */
export const THEME_STORAGE_KEY = 'moondreams-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const THEMES: readonly SiteTheme[] = ['system', 'light', 'dark', 'sunset'];
const LOCATION_REFRESH_MS = 30 * 60_000;

const readStoredTheme = (): SiteTheme => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.find((theme) => theme === stored) ?? 'system';
  } catch {
    return 'system';
  }
};

const storeTheme = (theme: SiteTheme) => {
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

const resolveTheme = (
  theme: SiteTheme,
  isDeviceDark: boolean,
  sunset: SunsetState | null,
): 'light' | 'dark' => {
  if (theme === 'system') {
    return isDeviceDark ? 'dark' : 'light';
  }
  if (theme === 'sunset') {
    return sunset?.isDark ? 'dark' : 'light';
  }
  return theme;
};

type ZoneCoordinates = { zone: string; coordinates: Coordinates | null };

// A saved position stands only while the phone is still in the zone it was taken in; a traveller
// gets the new zone's estimate until a fresh position arrives. `undefined` = the zone's point is loading.
const pickSunCoordinates = (
  place: SunPlace | null,
  timeZone: string | null,
  zoneCoordinates: ZoneCoordinates | null,
): { coordinates: Coordinates | null | undefined; isEstimate: boolean } => {
  if (
    place?.kind === 'location' &&
    (place.timeZone === null || place.timeZone === timeZone)
  ) {
    return { coordinates: place, isEstimate: false };
  }
  if (!timeZone) {
    return { coordinates: null, isEstimate: true };
  }
  if (zoneCoordinates?.zone !== timeZone) {
    return { coordinates: undefined, isEstimate: true };
  }
  return { coordinates: zoneCoordinates.coordinates, isEstimate: true };
};

const readGrantedLocation = async (): Promise<SunPlace | null> => {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    if (status?.state !== 'granted') {
      return null;
    }
    const coordinates = await getCurrentCoordinates();
    return { kind: 'location', ...coordinates, timeZone: getDeviceTimeZone() };
  } catch {
    return null;
  }
};

const applyBrowserColor = (theme: SiteTheme, resolved: 'light' | 'dark') => {
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((tag) => {
      const deviceMedia = tag.dataset.deviceMedia ?? tag.media;
      tag.dataset.deviceMedia = deviceMedia;
      if (theme === 'system') {
        tag.media = deviceMedia;
        return;
      }
      tag.media = deviceMedia.includes(resolved) ? 'all' : 'not all';
    });
};

/** The site's theme: Auto (follows the device, the default), Light, Dark or Sunset (dark from sunset to sunrise where the person is), remembered on this device and served through Dreamer UI's `useTheme` and the site's `useSiteTheme`. */
export function SiteThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<SiteTheme>(readStoredTheme);
  const [sunPlace, setSunPlace] = useState<SunPlace | null>(readSunPlace);
  const [zoneCoordinates, setZoneCoordinates] =
    useState<ZoneCoordinates | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastLocationRefresh = useRef(0);
  const isDeviceDark = useSyncExternalStore(
    subscribeToDevice,
    readDeviceIsDark,
    () => false,
  );

  const isSunset = theme === 'sunset';
  const timeZone = getDeviceTimeZone();
  const { coordinates, isEstimate } = pickSunCoordinates(
    sunPlace,
    timeZone,
    zoneCoordinates,
  );
  const sunsetResult = useMemo(
    () => (isSunset ? resolveSunset(now, coordinates, isEstimate) : null),
    [isSunset, now, coordinates, isEstimate],
  );
  const sunset = sunsetResult?.state ?? null;
  const todayMinutes = sunsetResult?.todayMinutes ?? null;
  const nextSwitchAt = sunset?.nextSwitchAt ?? null;

  const resolvedTheme = resolveTheme(theme, isDeviceDark, sunset);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        setThemeState(readStoredTheme());
      }
      if (event.key === SUN_PLACE_KEY) {
        setSunPlace(readSunPlace());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (!isSunset || !timeZone || zoneCoordinates?.zone === timeZone) {
      return;
    }
    let isCurrent = true;
    loadTimeZoneCoordinates(timeZone)
      .catch(() => null)
      .then((point) => {
        if (isCurrent) {
          setZoneCoordinates({ zone: timeZone, coordinates: point });
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [isSunset, timeZone, zoneCoordinates?.zone]);

  // A timer in a background tab can fire late or not at all; coming back re-reads the clock.
  useEffect(() => {
    if (nextSwitchAt === null) {
      return;
    }
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(1_000, nextSwitchAt - Date.now() + 1_000),
    );
    return () => window.clearTimeout(timer);
  }, [nextSwitchAt, now]);

  useEffect(() => {
    if (todayMinutes) {
      storeSunsetMinutes(todayMinutes);
    }
  }, [todayMinutes]);

  const refreshLocation = useCallback(() => {
    if (Date.now() - lastLocationRefresh.current < LOCATION_REFRESH_MS) {
      return;
    }
    lastLocationRefresh.current = Date.now();
    void readGrantedLocation().then((place) => {
      if (place) {
        storeSunPlace(place);
        setSunPlace(place);
      }
    });
  }, []);

  const hasSavedLocation = sunPlace?.kind === 'location';
  useEffect(() => {
    if (isSunset && hasSavedLocation) {
      refreshLocation();
    }
  }, [isSunset, hasSavedLocation, refreshLocation]);

  useOnTabReturn(() => {
    setNow(Date.now());
    if (isSunset && hasSavedLocation) {
      refreshLocation();
    }
  });

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.setAttribute('data-theme', resolvedTheme);
    applyBrowserColor(theme, resolvedTheme);
  }, [theme, resolvedTheme]);

  const setTheme = useCallback((next: SiteTheme) => {
    setNow(Date.now());
    setThemeState(next);
    storeTheme(next);
  }, []);

  const requestSunLocation = useCallback<
    SiteThemeValue['requestSunLocation']
  >(async () => {
    try {
      const position = await getCurrentCoordinates();
      const place: SunPlace = {
        kind: 'location',
        ...position,
        timeZone: getDeviceTimeZone(),
      };
      lastLocationRefresh.current = Date.now();
      storeSunPlace(place);
      setSunPlace(place);
      return { isGranted: true };
    } catch (error) {
      storeSunPlace({ kind: 'declined' });
      setSunPlace({ kind: 'declined' });
      return {
        isGranted: false,
        reason:
          error instanceof Error
            ? error.message
            : 'We couldn’t find your location just now.',
      };
    }
  }, []);

  const declineSunLocation = useCallback(() => {
    storeSunPlace({ kind: 'declined' });
    setSunPlace({ kind: 'declined' });
  }, []);

  const dreamerValue = useMemo<ThemeContextValue>(
    () => ({
      theme: theme === 'sunset' ? resolvedTheme : theme,
      setTheme,
      resolvedTheme,
      toggleTheme: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    }),
    [theme, setTheme, resolvedTheme],
  );

  const siteValue = useMemo<SiteThemeValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      sunset,
      sunPlace,
      timeZone,
      requestSunLocation,
      declineSunLocation,
    }),
    [
      theme,
      setTheme,
      resolvedTheme,
      sunset,
      sunPlace,
      timeZone,
      requestSunLocation,
      declineSunLocation,
    ],
  );

  return (
    <ThemeContext.Provider value={dreamerValue}>
      <SiteThemeChoiceContext.Provider value={siteValue}>
        {children}
      </SiteThemeChoiceContext.Provider>
    </ThemeContext.Provider>
  );
}
