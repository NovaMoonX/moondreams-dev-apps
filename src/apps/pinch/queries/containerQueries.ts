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
import type { Container } from '@apps/pinch/types';

export const containerKeys = {
  all: (uid: string) => ['pinch', uid, 'containers'] as const,
  finished: (uid: string, count: number) =>
    ['pinch', uid, 'containers', 'finished', count] as const,
  byRecipe: (uid: string, recipeId: string) =>
    ['pinch', uid, 'containers', 'recipe', recipeId] as const,
};

const containersOf = (uid: string) =>
  collection(db, 'apps', 'pinch', 'kitchens', uid, 'containers');

/** The latest finished containers, newest first: history, so it is read when the Finished view opens, not kept live. */
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

/** Every container made of one recipe, in stock or finished, for the cooking history's "Put away" line. */
export const recipeContainersQueryOptions = (uid: string, recipeId: string) =>
  queryOptions({
    queryKey: containerKeys.byRecipe(uid, recipeId),
    queryFn: async () => {
      const { docs } = await getDocs(
        query(containersOf(uid), where('recipeId', '==', recipeId)),
      );
      return docs.map((document) => document.data() as Container);
    },
    staleTime: 30_000,
    retry: false,
  });
