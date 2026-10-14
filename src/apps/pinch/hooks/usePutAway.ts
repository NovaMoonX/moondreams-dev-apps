import { useState } from 'react';

import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { useContainerActions } from '@apps/pinch/hooks/useContainerActions';
import {
  selectContainersByCookId,
  selectIsContainersReady,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import type { ContainerPlace, Recipe } from '@apps/pinch/types';
import {
  getEatByDefault,
  getEatByHint,
  getMoveForPlace,
  getPutAwayServings,
  isBulkMeal,
  isValidContainerServings,
  isValidEatBy,
} from '@apps/pinch/utils/containers';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';

interface UsePutAwayInput {
  uid: string;
  recipe: Recipe;
  /** What this cooking session makes. */
  servings: number;
  /** What the sitting just cooked for uses, when the plan says; else one sitting is taken to be a couple of servings. */
  eatenTonight: number | null;
  /** The cook the containers come from; null until the cook exists. */
  cookId: string | null;
}

interface Details {
  place: ContainerPlace;
  openedPlace: ContainerPlace;
  /** The place was an answer to the question, so the details don't ask it again. */
  isPlaceFixed: boolean;
  servings: number;
  typedEatBy: string | null;
}

const NO_CONTAINERS: never[] = [];

/** Cooking mode's "Putting any away?": the question, the container's details in place, and what was saved from this cook. Nothing here is required, and the details are typed work only once changed. */
export function usePutAway({
  uid,
  recipe,
  servings,
  eatenTonight,
  cookId,
}: UsePutAwayInput) {
  const { putAway } = useContainerActions(uid);
  const isReady = useAppSelector(selectIsContainersReady);
  const hasStock = useAppSelector((state) =>
    selectStockByRecipe(state).has(recipe.id),
  );
  const saved =
    useAppSelector((state) =>
      cookId === null ? undefined : selectContainersByCookId(state).get(cookId),
    ) ?? NO_CONTAINERS;
  const [details, setDetails] = useState<Details | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const care = getRecipeCare(recipe);
  const defaultServings = getPutAwayServings(servings, eatenTonight);
  const move = getMoveForPlace(details?.place ?? 'FRIDGE', null);
  const preset = getEatByDefault(move, care);
  const eatByText = details?.typedEatBy ?? toDateInputValue(preset.eatBy);
  const eatBy = fromDateInputValue(eatByText) ?? null;
  const isValid =
    details !== null &&
    isValidContainerServings(details.servings) &&
    eatBy !== null &&
    isValidEatBy(eatBy);

  const update = (patch: Partial<Details>) =>
    setDetails((current) => (current ? { ...current, ...patch } : current));

  const save = async () => {
    if (details === null || eatBy === null || !isValid || cookId === null) {
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await putAway({
        title: recipe.title,
        recipeId: recipe.id,
        mealId: null,
        cookId,
        servings: details.servings,
        place: details.place,
        eatBy,
      });
      setDetails(null);
      setIsSaving(false);
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this container.'));
      setIsSaving(false);
    }
  };

  return {
    isAvailable: isReady && cookId !== null,
    isBulk: isBulkMeal({ servings, care, hasStock }),
    isDismissed,
    saved,
    isOpen: details !== null,
    isSaving,
    error,
    canSave: isValid,
    hasDraft:
      details !== null &&
      !isSaving &&
      (details.servings !== defaultServings ||
        details.typedEatBy !== null ||
        details.place !== details.openedPlace),
    fields:
      details === null
        ? null
        : {
            place: details.place,
            setPlace: (place: ContainerPlace) => update({ place }),
            servings: details.servings,
            setServings: (next: number) => update({ servings: next }),
            eatByText,
            setEatByText: (text: string) => update({ typedEatBy: text }),
            hint: getEatByHint(move, preset),
          },
    isPlaceFixed: details?.isPlaceFixed ?? false,
    open: (place: ContainerPlace, isPlaceFixed = true) => {
      setError(null);
      setDetails({
        place,
        openedPlace: place,
        isPlaceFixed,
        servings: defaultServings,
        typedEatBy: null,
      });
    },
    dismiss: () => setIsDismissed(true),
    skip: () => {
      setDetails(null);
      setError(null);
      setIsDismissed(true);
    },
    save,
  };
}
