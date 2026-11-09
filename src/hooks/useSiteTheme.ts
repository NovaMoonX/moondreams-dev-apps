import { createContext, useContext } from 'react';

import type { Theme } from '@moondreamsdev/dreamer-ui/hooks';

import type { SunPlace, SunsetState } from '@/lib/theme/sunsetTheme';

/** Dreamer UI's three choices plus Sunset: light by day, dark from sunset to sunrise where the person is. */
export type SiteTheme = Theme | 'sunset';

export interface SiteThemeValue {
  theme: SiteTheme;
  setTheme: (theme: SiteTheme) => void;
  resolvedTheme: 'light' | 'dark';
  /** Today's switch times while Sunset is chosen; null otherwise. */
  sunset: SunsetState | null;
  /** The location answer kept on this device; null until the person has answered. */
  sunPlace: SunPlace | null;
  /** The device's time zone, which the estimate falls back to. */
  timeZone: string | null;
  /** Asks the browser for the position (it prompts) and keeps it rounded; a refusal is kept as a no (a timeout is not), and the failure's sentence returned. Call it from a tap. */
  requestSunLocation: () => Promise<
    { isGranted: true } | { isGranted: false; isDenied: boolean; reason: string }
  >;
  /** Keeps a no without asking the browser. */
  declineSunLocation: () => void;
}

export const SiteThemeChoiceContext = createContext<SiteThemeValue | null>(null);

/** The site's theme choice, Sunset included; Dreamer UI's `useTheme` still gives the light or dark in effect. */
export function useSiteTheme(): SiteThemeValue {
  const value = useContext(SiteThemeChoiceContext);
  if (!value) {
    throw new Error('useSiteTheme must be used inside SiteThemeProvider');
  }
  return value;
}
