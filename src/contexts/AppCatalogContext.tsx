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
import { db, isUsingFirebaseEmulators } from '@lib/firebase/config';
import {
  normalizeAppStatus,
  type AppMetadata,
} from '@lib/types/appCatalog';
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
    status: normalizeAppStatus(data.status ?? registryEntry?.status ?? 'draft'),
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
  status: normalizeAppStatus(app.status ?? 'draft'),
  isRestricted: false,
  allowedUsers: [],
  createdAt: app.createdAt
    ? new Date(app.createdAt).toISOString()
    : new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

const PUBLIC_STATIC_APP_REGISTRY: AppMetadata[] = STATIC_APP_REGISTRY.filter(
  (app) => app.status === 'public' && !app.isRestricted,
);

// Mirrors firestore.rules' canReadAppDoc(): admins, and anyone in the
// local emulator, see every app regardless of status.
function canSeeAllApps(isAdmin: boolean) {
  return isAdmin || isUsingFirebaseEmulators;
}

function buildAppQueries(user: User | null, isAdmin: boolean) {
  const appsCollection = collection(db, 'apps');

  if (canSeeAllApps(isAdmin)) {
    return [query(appsCollection)];
  }

  const queries = [
    // Query 1: Targets ONLY public & UNRESTRICTED docs
    query(
      appsCollection,
      where('status', '==', 'public'),
      where('isRestricted', '==', false),
    ),
  ];

  if (user?.uid) {
    // Query 2: Targets ONLY public & RESTRICTED docs where UID matches
    queries.push(
      query(
        appsCollection,
        where('status', '==', 'public'),
        where('isRestricted', '==', true),
        where('allowedUsers', 'array-contains', user.uid),
      ),
    );
  }

  if (user?.email) {
    // Query 3: Targets ONLY public & RESTRICTED docs where Email matches
    queries.push(
      query(
        appsCollection,
        where('status', '==', 'public'),
        where('isRestricted', '==', true),
        where('allowedUsers', 'array-contains', user.email),
      ),
    );
  }

  return queries;
}

// Identifies which user/role combo a resolved app catalog belongs to, so
// `loading` can be derived at render time (see below) instead of reset with
// an imperative `setLoading(true)` inside the effect body.
function getQueryKey(user: User | null, isAdmin: boolean) {
  return `${user?.uid ?? 'anon'}:${isAdmin}`;
}

export function AppCatalogProvider({ children }: PropsWithChildren) {
  const { user, isAdmin } = useAuth();
  const [allApps, setAllApps] = useState<AppMetadata[]>([]);
  const [resolvedQueryKey, setResolvedQueryKey] = useState<string | null>(null);

  const queryKey = getQueryKey(user, isAdmin);
  // Restricted apps (Nine Lives, Worth the Wait) only ever show up via
  // Query 2/3 below — the uid/email `array-contains` queries. Deriving
  // `loading` from whether *all* of this user's queries have resolved (set
  // in markQueryResolved, once per full query set) instead of flipping it
  // false as soon as ANY one resolves (usually Query 1, the
  // unrestricted-public query, which is often fast and empty) closes a
  // narrow window right after a hard refresh where `apps` doesn't yet
  // include a restricted app the user actually has access to, and
  // ProtectedRoute bounces them to /unauthorized before Query 2/3 catch up.
  const loading = resolvedQueryKey !== queryKey;

  useEffect(() => {
    const currentQueryKey = getQueryKey(user, isAdmin);
    const queries = buildAppQueries(user, isAdmin);
    const appMap = new Map<string, AppMetadata>();
    let isActive = true;

    const resolvedQueryIndexes = new Set<number>();
    function markQueryResolved(index: number) {
      resolvedQueryIndexes.add(index);
      if (isActive && resolvedQueryIndexes.size === queries.length) {
        setResolvedQueryKey(currentQueryKey);
      }
    }

    const unsubscribers = queries.map((queryRef, index) =>
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
          markQueryResolved(index);
        },
        (error) => {
          console.error('Failed to load app catalog:', error);
          if (isActive) {
            setAllApps(PUBLIC_STATIC_APP_REGISTRY);
            markQueryResolved(index);
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
    if (canSeeAllApps(isAdmin)) {
      return allApps;
    }

    if (!user) {
      return allApps.filter((app) => app.status === 'public' && !app.isRestricted);
    }

    return allApps.filter((app) => {
      if (app.status !== 'public') {
        return false;
      }

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
