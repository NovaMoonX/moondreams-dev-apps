import { queryOptions } from '@tanstack/react-query';
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

/** Read on demand rather than listened to: finished containers only pile up. */
export const finishedContainersQueryOptions = (uid: string, count: number) =>
  queryOptions({
    queryKey: containerKeys.finished(uid, count),
    queryFn: async () => {
      const { docs } = await getDocs(
        query(
          containersOf(uid),
          where('status', '==', 'DONE'),
          orderBy('updatedAt', 'desc'),
          limit(count),
        ),
      );
      return docs.map((document) => document.data() as Container);
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
    queryFn: async () => {
      const { docs } = await getDocs(
        query(
          containersOf(uid),
          where(field, '==', id),
          limit(CONTAINER_QUERY_LIMIT),
        ),
      );
      return docs.map((document) => document.data() as Container);
    },
    staleTime: 30_000,
    retry: false,
  });
