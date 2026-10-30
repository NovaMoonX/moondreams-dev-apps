import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
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
import { APP_REGISTRY_ID_MAP, orderApps } from '@lib/app';
import { db, isUsingFirebaseEmulators } from '@lib/firebase/config';
import {
  normalizeAppStatus,
  type AppMetadata,
  type UserPrefs,
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
    status: normalizeAppStatus(data.status ?? 'draft'),
    isRestricted: Boolean(data.isRestricted),
    isRequestable: data.isRequestable === true,
    allowedUsers: Array.isArray(data.allowedUsers)
      ? data.allowedUsers.map(String)
      : [],
    createdAt: data.createdAt ?? fallbackCreatedAt,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

// Mirrors firestore.rules: admins and local-emulator users can read every
// app doc regardless of status.
function canSeeAllApps(isAdmin: boolean) {
  return isAdmin || isUsingFirebaseEmulators;
}

// Firestore has no OR — one query per way a doc can be visible.
function buildAppQueries(user: User | null, isAdmin: boolean) {
  const appsCollection = collection(db, 'apps');

  if (canSeeAllApps(isAdmin)) {
    return [query(appsCollection)];
  }

  const queries = [
    query(
      appsCollection,
      where('status', '==', 'public'),
      where('isRestricted', '==', false),
    ),
  ];

  if (user?.uid) {
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
    queries.push(
      query(
        appsCollection,
        where('status', '==', 'public'),
        where('isRestricted', '==', true),
        where('allowedUsers', 'array-contains', user.email),
      ),
    );
  }

  if (user !== null) {
    queries.push(
      query(
        appsCollection,
        where('status', '==', 'public'),
        where('isRestricted', '==', true),
        where('isRequestable', '==', true),
      ),
    );
  }

  return queries;
}

// Identifies which user/role a resolved catalog belongs to, so `loading`
// can be derived at render time instead of reset imperatively in an effect.
function getQueryKey(user: User | null, isAdmin: boolean) {
  return `${user?.uid ?? 'anon'}:${isAdmin}`;
}

export function AppCatalogProvider({ children }: PropsWithChildren) {
  const { user, isAdmin } = useAuth();
  const [allApps, setAllApps] = useState<AppMetadata[]>([]);
  const [resolvedQueryKey, setResolvedQueryKey] = useState<string | null>(null);
  const [starred, setStarred] = useState<{ uid: string; ids: string[] } | null>(null);
  const uid = user?.uid ?? null;
  const starredUid = starred?.uid ?? null;
  const starredAppIds = useMemo(
    () => (starred !== null && starred.uid === uid ? starred.ids : []),
    [starred, uid],
  );

  const queryKey = getQueryKey(user, isAdmin);
  // True until every query for this user has resolved at least once — not
  // just the first one — so a restricted app isn't missing from `apps` yet.
  // An app that works signed out (Runway's start) has no use for the catalog, which the rules refuse a visitor.
  const isSkipped =
    user === null && window.location.pathname.startsWith('/runway');
  // Stars set the order, so the list waits for them rather than reshuffling once they arrive.
  const isStarredPending = user !== null && starredUid !== user.uid;
  const loading = !isSkipped && (resolvedQueryKey !== queryKey || isStarredPending);

  useEffect(() => {
    if (isSkipped) return;
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
            setAllApps([]);
            markQueryResolved(index);
          }
        },
      ),
    );

    return () => {
      isActive = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [isAdmin, user, isSkipped]);

  useEffect(() => {
    if (uid === null) return;
    return onSnapshot(
      doc(db, 'userPrefs', uid),
      (snapshot) => {
        const data = snapshot.data() as Partial<UserPrefs> | undefined;
        setStarred({ uid, ids: Array.isArray(data?.starredAppIds) ? data.starredAppIds.map(String) : [] });
      },
      (error) => {
        console.error('Failed to load starred apps:', error);
        setStarred({ uid, ids: [] });
      },
    );
  }, [uid]);

  const setAppStarred = useCallback(
    async (appId: string, isStarred: boolean) => {
      if (uid === null) return;
      await setDoc(
        doc(db, 'userPrefs', uid),
        {
          uid,
          starredAppIds: isStarred ? arrayUnion(appId) : arrayRemove(appId),
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    },
    [uid],
  );

  const visibleApps = useMemo(() => {
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

  const apps = useMemo(() => orderApps(visibleApps, starredAppIds), [visibleApps, starredAppIds]);
  const requestableApps = useMemo(
    () =>
      canSeeAllApps(isAdmin) || user === null
        ? []
        : orderApps(
            allApps.filter(
              (app) =>
                app.status === 'public' &&
                app.isRestricted &&
                app.isRequestable &&
                !visibleApps.some((visible) => visible.id === app.id),
            ),
            [],
          ),
    [allApps, isAdmin, user, visibleApps],
  );

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
      requestableApps,
      starredAppIds,
      setAppStarred,
      allApps,
      appPathMap,
      loading,
      updateAppMetadata,
    }),
    [apps, requestableApps, starredAppIds, setAppStarred, allApps, appPathMap, loading, updateAppMetadata],
  );

  return (
    <AppCatalogContext.Provider value={value}>
      {children}
    </AppCatalogContext.Provider>
  );
}
