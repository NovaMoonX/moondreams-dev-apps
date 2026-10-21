import { useCallback, useEffect, useRef } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { setRecipeFavorite } from '@apps/pinch/store/actions/recipeActions';
import type { Recipe } from '@apps/pinch/types';
import { isStarred, shouldIgnoreStarTap } from '@apps/pinch/utils/favorites';

export function useRecipeFavorite(uid: string) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const pending = useRef(new Map<string, boolean>());
  const toast = useRef(addToast);
  useEffect(() => {
    toast.current = addToast;
  });

  const toggle = useCallback(
    (recipe: Pick<Recipe, 'id' | 'title' | 'isFavorite'>) => {
      const shown = isStarred(recipe);
      if (shouldIgnoreStarTap(pending.current.get(recipe.id) ?? null, shown)) {
        return;
      }
      const next = !shown;
      pending.current.set(recipe.id, next);
      dispatch(setRecipeFavorite({ uid, id: recipe.id, isFavorite: next }))
        .unwrap()
        .catch((error: unknown) =>
          toast.current({
            title: next
              ? `Couldn't star ${recipe.title}`
              : `Couldn't take the star off ${recipe.title}`,
            description: getErrorMessage(error, 'Try again in a moment.'),
            type: 'error',
          }),
        )
        .finally(() => {
          if (pending.current.get(recipe.id) === next) {
            pending.current.delete(recipe.id);
          }
        });
    },
    [dispatch, uid],
  );

  return toggle;
}
