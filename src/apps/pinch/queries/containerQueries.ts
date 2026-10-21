import { queryOptions } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { CONTAINER_QUERY_LIMIT } from '@apps/pinch/constants';
import type { Container } from '@apps/pinch/types';

export const containerKeys = {
  all: (uid: string) => ['pinch', uid, 'containers'] as const,
  finished: (uid: string, count: number) =>
    ['pinch', uid, 'containers', 'finished', count] as const,
  scoped: (uid: string, field: 'recipeId' | 'mealId', id: string) =>
    ['pinch', uid, 'containers', 'scoped', field, id] as const,
};

const containersOf = (uid: string) =>
  collection(db, 'apps', 'pinch', 'kitchens', uid, 'containers');

/** An empty answer that came only from the device's cache: the read never reached the server, so it says nothing about what exists. */
export class OfflineEmptyReadError extends Error {}

const readContainers = async (source: Parameters<typeof getDocs>[0]) => {
  const snapshot = await getDocs(source).catch((error: unknown) => {
    if (!(error instanceof FirebaseError && error.code === 'unavailable')) {
      console.error('Pinch containers read failed', error);
    }
    throw error;
  });
  if (snapshot.empty && snapshot.metadata.fromCache) {
    throw new OfflineEmptyReadError("Couldn't reach the server.");
  }
  const containers = snapshot.docs.map(
    (document) => document.data() as Container,
  );
  return containers;
};

const getFinishedHintKey = (uid: string) => `pinch:${uid}:has-finished`;

/** Whether this device last saw finished boxes, so the door to them keeps its place while the read lands; a wrong guess only moves the list once. */
export const hasSeenFinished = (uid: string) => {
  try {
    return localStorage.getItem(getFinishedHintKey(uid)) === 'true';
  } catch {
    return false;
  }
};

const rememberFinished = (uid: string, hasAny: boolean) => {
  try {
    localStorage.setItem(getFinishedHintKey(uid), String(hasAny));
  } catch {
    // Only the held place is lost.
  }
};

/** Read on demand rather than listened to: finished containers only pile up. */
export const finishedContainersQueryOptions = (uid: string, count: number) =>
  queryOptions({
    queryKey: containerKeys.finished(uid, count),
    queryFn: async () => {
      const containers = await readContainers(
        query(
          containersOf(uid),
          where('status', '==', 'DONE'),
          orderBy('updatedAt', 'desc'),
          limit(count),
        ),
      );
      rememberFinished(uid, containers.length > 0);
      return containers;
    },
    staleTime: 30_000,
    retry: false,
  });

export const scopedContainersQueryOptions = (
  uid: string,
  field: 'recipeId' | 'mealId',
  id: string,
) =>
  queryOptions({
    queryKey: containerKeys.scoped(uid, field, id),
    queryFn: () =>
      readContainers(
        query(
          containersOf(uid),
          where(field, '==', id),
          limit(CONTAINER_QUERY_LIMIT),
        ),
      ),
    staleTime: 30_000,
    retry: false,
  });
