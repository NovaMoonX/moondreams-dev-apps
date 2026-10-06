import { useEffect } from 'react';

import '@apps/waypoint/waypoint.css';

const THEME_CLASS = 'waypoint-theme';

/** Themes the whole page, portaled modals and drawers included, only while Waypoint is mounted. */
export function useWaypointTheme() {
  useEffect(() => {
    document.documentElement.classList.add(THEME_CLASS);
    return () => document.documentElement.classList.remove(THEME_CLASS);
  }, []);
}
