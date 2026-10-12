import type { AppId } from '../types/appCatalog';

export type AppRegistryEntry = {
  id: AppId;
  name: string;
  path: string;
  description: string;
  createdAt?: string; // YYYY-MM-DD
};

/* IMPORTANT: A new app is more than an entry here: follow the "New mini-app checklist" in
   .github/copilot-instructions.md (usage tracking hook and finder, store, rules, seed, docs).
   Keep the following in sync with this registry:
   - in /public folder: logos and banners
   - cloudflare-worker.js
   - repo root README.md (its "Current apps" list: one line per app)
*/
export const APP_REGISTRY: AppRegistryEntry[] = [
  {
    id: 'worth-the-wait',
    name: 'Worth the Wait',
    path: '/worth-the-wait',
    description:
      'A private space for companions to place thoughts, feelings, hopes, and desires until the right moment to share them arrives.',
    createdAt: '2026-08-16',
  },
  {
    id: 'nine-lives',
    name: 'Nine Lives',
    path: '/nine-lives',
    description:
      'A private home base for cat owners to keep track of health records, visits, vaccinations, symptoms, and the everyday care that keeps a household organized.',
    createdAt: '2026-09-10',
  },
  {
    id: 'waypoint',
    name: 'Waypoint',
    path: '/waypoint',
    description:
      'A collaborative trip planner for shared itineraries, live travel coordination, and the details that keep a journey running smoothly.',
    createdAt: '2026-09-15',
  },
  {
    id: 'a-list',
    name: 'A-List Tracker',
    path: '/a-list',
    description:
      'A personal companion for AMC Stubs A-List members that turns a calendar of movie nights into ticket savings, premium-format savings, and a clear answer on whether the membership is paying for itself.',
    createdAt: '2026-10-03',
  },
];

export const APP_REGISTRY_ID_MAP = Object.fromEntries(
  APP_REGISTRY.map((app) => [app.id, app]),
) as Record<string, AppRegistryEntry>;

export const APP_REGISTRY_PATH_MAP = Object.fromEntries(
  APP_REGISTRY.map((app) => [app.path, app]),
) as Record<string, AppRegistryEntry>;

/** The registered app that owns a pathname, matched on its first path segment (`/a-list/`, `/a-list/shared/x`), or null for the hub and other site pages. */
export function getRegistryAppForPath(pathname: string) {
  const firstSegment = (pathname.split('/')[1] ?? '').toLowerCase();
  const result = APP_REGISTRY_PATH_MAP[`/${firstSegment}`] ?? null;
  return result;
}

export function getUnconfiguredRegistryApps(
  allApps: Array<{
    id: AppId;
    name?: string;
    description?: string;
    path?: string;
  }>,
) {
  const configuredMap = new Map(allApps.map((app) => [app.id, app]));

  return APP_REGISTRY.filter((registeredApp) => {
    const details = configuredMap.get(registeredApp.id);
    const effectiveName = (details?.name ?? registeredApp.name).trim();
    const effectiveDescription = (
      details?.description ?? registeredApp.description
    ).trim();
    const effectivePath = (details?.path ?? registeredApp.path).trim();

    return !effectiveName || !effectiveDescription || !effectivePath;
  });
}
