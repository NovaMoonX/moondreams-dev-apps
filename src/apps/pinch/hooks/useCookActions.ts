import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch, useAppSelector } from '@/store';
import {
  addCook,
  markPlannedCooked,
  removeCook,
} from '@apps/pinch/store/actions/cookActions';
import { selectCooksLoadError } from '@apps/pinch/store/selectors';
import type { Recipe } from '@apps/pinch/types';

const UNDO_TOAST_MS = 6000;

interface MarkPlannedInput {
  plannedMealId: string;
  recipe: Pick<Recipe, 'id' | 'title'>;
  servings: number;
  cookedAt: number;
}

/** What marking a recipe cooked does and says, shared by the recipe drawer, cooking mode and a planned meal. Each call rejects with a sentence the caller shows. */
export function useCookActions(uid: string) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const isLoaded = useAppSelector((state) => state.pinch.cooks.isLoaded);
  const loadError = useAppSelector(selectCooksLoadError);

  const undoCook = async (id: string) => {
    await dispatch(removeCook({ uid, id })).unwrap();
  };

  const undoFromToast = async (id: string) => {
    try {
      await undoCook(id);
    } catch {
      addToast({
        title: "Couldn't undo that",
        description: 'You can delete it from the cooking history.',
        type: 'error',
      });
    }
  };

  const markRecipeCooked = async (
    recipe: Pick<Recipe, 'id' | 'title'>,
    servings: number,
  ) => {
    const id = await dispatch(
      addCook({
        uid,
        recipeId: recipe.id,
        servings,
        cookedAt: Date.now(),
      }),
    ).unwrap();
    addToast({
      title: `Marked ${recipe.title} as cooked`,
      type: 'success',
      duration: UNDO_TOAST_MS,
      action: { label: 'Undo', onClick: () => void undoFromToast(id) },
    });
  };

  const markPlannedRecipeCooked = async ({
    plannedMealId,
    recipe,
    servings,
    cookedAt,
  }: MarkPlannedInput) => {
    const { isNew } = await dispatch(
      markPlannedCooked({
        uid,
        plannedMealId,
        recipeId: recipe.id,
        servings,
        cookedAt,
      }),
    ).unwrap();
    if (!isNew) {
      addToast({
        title: 'Already marked',
        description: `${recipe.title} is already marked as cooked for this meal.`,
        type: 'info',
      });
    }
  };

  return {
    isReady: isLoaded && loadError === null,
    isLoaded,
    loadError,
    markRecipeCooked,
    markPlannedRecipeCooked,
    undoCook,
  };
}
