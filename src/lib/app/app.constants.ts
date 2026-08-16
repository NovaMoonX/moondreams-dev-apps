export const APP_TITLE = 'MoonDreams App';
export const APP_DESCRIPTION =
  'A collection of small apps designed to help address, solve, or simplify whatever was going on at that time.';

export const APP_CATALOG = [
  {
    id: 'worth-the-wait',
    name: 'Worth the Wait',
    path: '/worth-the-wait',
    description:
      'A private space for companions to place thoughts, feelings, hopes, and desires until the right moment to share them arrives.',
  },
];

export const APP_CATALOG_PATH_MAP = APP_CATALOG.reduce(
  (map, app) => {
    map[app.path] = app;
    return map;
  },
  {} as Record<string, (typeof APP_CATALOG)[number]>,
);
