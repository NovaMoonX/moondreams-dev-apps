import { createContext, useContext } from 'react';

import type { AppListing, AppMetadata } from '@lib/types/appCatalog';

export type AppCatalogContextValue = {
  /** What this person can open, starred first. */
  apps: AppMetadata[];
  /** Restricted apps this person doesn't have yet but may ask for. */
  requestableApps: AppListing[];
  starredAppIds: string[];
  setAppStarred: (appId: string, isStarred: boolean) => Promise<void>;
  allApps: AppMetadata[];
  appPathMap: Record<string, AppMetadata>;
  loading: boolean;
  updateAppMetadata: (appId: string, payload: Partial<AppMetadata>) => Promise<void>;
};

export const AppCatalogContext = createContext<AppCatalogContextValue | undefined>(undefined);

export function useAppCatalog() {
  const context = useContext(AppCatalogContext);

  if (!context) {
    throw new Error('useAppCatalog must be used within an AppCatalogProvider');
  }

  return context;
}
