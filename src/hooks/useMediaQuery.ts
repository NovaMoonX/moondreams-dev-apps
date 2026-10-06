import { useMemo, useSyncExternalStore } from 'react';

/** Mirrors Tailwind v4's default screens (px); keep in sync if the theme adds or changes one. */
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

function computeActiveBreakpoint(): ActiveBreakpoint {
  const active =
    BREAKPOINT_QUERIES.filter(({ query }) => window.matchMedia(query).matches).at(-1)?.name ??
    'base';
  return active;
}

// Every component using the hook reads this on each render, so it is cached and refreshed only
// when a breakpoint query changes.
let activeBreakpoint: ActiveBreakpoint | null = null;
const getActiveBreakpoint = () => (activeBreakpoint ??= computeActiveBreakpoint());

function subscribe(onChange: () => void) {
  const mediaQueryLists = BREAKPOINT_QUERIES.map(({ query }) => window.matchMedia(query));
  const handleChange = () => {
    activeBreakpoint = computeActiveBreakpoint();
    onChange();
  };
  mediaQueryLists.forEach((list) => list.addEventListener('change', handleChange));
  return () => mediaQueryLists.forEach((list) => list.removeEventListener('change', handleChange));
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
