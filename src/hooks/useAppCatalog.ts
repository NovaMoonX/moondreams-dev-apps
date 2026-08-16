import { createContext, useContext } from 'react';

import type { AppMetadata } from '@lib/types/appCatalog';

export type AppCatalogContextValue = {
  apps: AppMetadata[];
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
