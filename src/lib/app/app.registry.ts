import { AppId } from '../types/appCatalog';

export type AppRegistryEntry = {
  id: AppId;
  name: string;
  path: string;
  description: string;
  createdAt?: string; // YYYY-MM-DD
};

/* IMPORTANT: Keep the following in sync with this registry:
   - in /public folder: manifests, logos, and banners
   - cloudflare-worker.js
   - repo root README.md
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
];

export const APP_REGISTRY_ID_MAP = Object.fromEntries(
  APP_REGISTRY.map((app) => [app.id, app]),
) as Record<string, AppRegistryEntry>;

export const APP_REGISTRY_PATH_MAP = Object.fromEntries(
  APP_REGISTRY.map((app) => [app.path, app]),
) as Record<string, AppRegistryEntry>;

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
