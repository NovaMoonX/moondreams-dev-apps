import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AppCatalogContext,
  type AppCatalogContextValue,
} from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { APP_REGISTRY, APP_REGISTRY_ID_MAP } from '@lib/app';
import { db } from '@lib/firebase/config';
import type { AppMetadata } from '@lib/types/appCatalog';
import { User } from 'firebase/auth';

function normalizeAppMetadata(
  id: string,
  data: Partial<AppMetadata> = {},
): AppMetadata {
  const registryEntry = APP_REGISTRY_ID_MAP[id];

  const fallbackCreatedAt = registryEntry?.createdAt
    ? new Date(registryEntry.createdAt).toISOString()
    : new Date().toISOString();

  return {
    id,
    name: data.name?.trim() || registryEntry?.name || 'Untitled app',
    path: data.path ?? registryEntry?.path ?? `/${id}`,
    description: data.description?.trim() || registryEntry?.description || '',
    isRestricted: Boolean(data.isRestricted),
    allowedUsers: Array.isArray(data.allowedUsers)
      ? data.allowedUsers.map(String)
      : [],
    createdAt: data.createdAt ?? fallbackCreatedAt,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

const STATIC_APP_REGISTRY: AppMetadata[] = APP_REGISTRY.map((app) => ({
  id: app.id,
  name: app.name,
  path: app.path,
  description: app.description,
  isRestricted: false,
  allowedUsers: [],
  createdAt: app.createdAt
    ? new Date(app.createdAt).toISOString()
    : new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

function buildAppQueries(user: User | null, isAdmin: boolean) {
  const appsCollection = collection(db, 'apps');

  if (isAdmin) {
    return [query(appsCollection)];
  }

  if (!user) {
    return [query(appsCollection, where('isRestricted', '==', false))];
  }

  const queries = [query(appsCollection, where('isRestricted', '==', false))];

  if (user.uid) {
    queries.push(
      query(appsCollection, where('allowedUsers', 'array-contains', user.uid)),
    );
  }

  if (user.email) {
    queries.push(
      query(
        appsCollection,
        where('allowedUsers', 'array-contains', user.email),
      ),
    );
  }

  return queries;
}

export function AppCatalogProvider({ children }: PropsWithChildren) {
  const { user, isAdmin } = useAuth();
  const [allApps, setAllApps] = useState<AppMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const queries = buildAppQueries(user, isAdmin);
    const appMap = new Map<string, AppMetadata>();
    let isActive = true;

    const unsubscribers = queries.map((queryRef) =>
      onSnapshot(
        queryRef,
        (snapshot) => {
          snapshot.docs.forEach((docSnapshot) => {
            const app = normalizeAppMetadata(
              docSnapshot.id,
              docSnapshot.data() as Partial<AppMetadata>,
            );
            appMap.set(app.id, app);
          });

          if (!isActive) {
            return;
          }

          const nextApps = Array.from(appMap.values())
          setAllApps(nextApps);
          setLoading(false);
        },
        (error) => {
          console.error('Failed to load app catalog:', error);
          if (isActive) {
            setAllApps(STATIC_APP_REGISTRY);
            setLoading(false);
          }
        },
      ),
    );

    return () => {
      isActive = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [isAdmin, user]);

  const apps = useMemo(() => {
    if (!user) {
      return allApps.filter((app) => !app.isRestricted);
    }

    if (isAdmin) {
      return allApps;
    }

    return allApps.filter((app) => {
      if (!app.isRestricted) {
        return true;
      }

      const normalizedAllowedUsers = app.allowedUsers.map((value) =>
        value.trim().toLowerCase(),
      );
      const userEmail = user.email?.trim().toLowerCase() ?? '';

      return (
        normalizedAllowedUsers.includes(user.uid.trim().toLowerCase()) ||
        normalizedAllowedUsers.includes(userEmail)
      );
    });
  }, [allApps, isAdmin, user]);

  const updateAppMetadata = useCallback(
    async (appId: string, payload: Partial<AppMetadata>) => {
      if (!isAdmin) {
        throw new Error('Only admins can update app catalog metadata.');
      }

      const appRef = doc(db, 'apps', appId);
      await updateDoc(appRef, {
        ...payload,
        updatedAt: new Date().toISOString(),
      });
    },
    [isAdmin],
  );

  const appPathMap = useMemo<Record<string, AppMetadata>>(
    () =>
      allApps.reduce<Record<string, AppMetadata>>((map, app) => {
        map[app.path] = app;
        return map;
      }, {}),
    [allApps],
  );

  const value = useMemo<AppCatalogContextValue>(
    () => ({
      apps,
      allApps,
      appPathMap,
      loading,
      updateAppMetadata,
    }),
    [apps, allApps, appPathMap, loading, updateAppMetadata],
  );

  return (
    <AppCatalogContext.Provider value={value}>
      {children}
    </AppCatalogContext.Provider>
  );
}
