import { useMemo, useSyncExternalStore } from 'react';

/** Tailwind v4's default screens, in px. A new key here becomes available to every caller. */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;
export type ActiveBreakpoint = Breakpoint | 'base';

export interface MediaQueryState {
  breakpoint: ActiveBreakpoint;
  isAtLeast: (breakpoint: Breakpoint) => boolean;
  isBelow: (breakpoint: Breakpoint) => boolean;
}

const BREAKPOINT_QUERIES = (Object.entries(BREAKPOINTS) as [Breakpoint, number][])
  .sort(([, a], [, b]) => a - b)
  .map(([name, minWidth]) => ({ name, query: `(min-width: ${minWidth}px)` }));

function getActiveBreakpoint(): ActiveBreakpoint {
  const active =
    BREAKPOINT_QUERIES.filter(({ query }) => window.matchMedia(query).matches).at(-1)?.name ??
    'base';
  return active;
}

function subscribe(onChange: () => void) {
  const mediaQueryLists = BREAKPOINT_QUERIES.map(({ query }) => window.matchMedia(query));
  mediaQueryLists.forEach((list) => list.addEventListener('change', onChange));
  return () => mediaQueryLists.forEach((list) => list.removeEventListener('change', onChange));
}

export function useMediaQuery(): MediaQueryState {
  const breakpoint = useSyncExternalStore<ActiveBreakpoint>(
    subscribe,
    getActiveBreakpoint,
    () => 'base',
  );
  const state = useMemo(() => {
    const width = breakpoint === 'base' ? 0 : BREAKPOINTS[breakpoint];
    const result: MediaQueryState = {
      breakpoint,
      isAtLeast: (target) => width >= BREAKPOINTS[target],
      isBelow: (target) => width < BREAKPOINTS[target],
    };
    return result;
  }, [breakpoint]);

  return state;
}
