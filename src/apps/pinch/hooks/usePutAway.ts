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
import { CONTAINER_SITTING_SERVINGS } from '@apps/pinch/constants';
import {
  getContainerCountMax,
  getEatByDefault,
  getEatByHint,
  getMoveForPlace,
  getPutAwayBasis,
  getPutAwayServings,
  getSplitText,
  getStartServings,
  isBulkMeal,
  isValidContainerServings,
  isValidEatBy,
  splitServings,
} from '@apps/pinch/utils/containers';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';

interface UsePutAwayInput {
  uid: string;
  recipe: Recipe;
  servings: number;
  eatenTonight: number | null;
  /** Null until the cook exists. */
  cookId: string | null;
}

interface Details {
  place: ContainerPlace;
  openedPlace: ContainerPlace;
  isPlaceFixed: boolean;
  servings: number;
  containers: number;
  typedEatBy: string | null;
}

const NO_CONTAINERS: never[] = [];

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
  const savedTotal = saved.reduce(
    (sum, container) => sum + (getStartServings(container) ?? 0),
    0,
  );
  const left = Math.floor(
    servings - (eatenTonight ?? CONTAINER_SITTING_SERVINGS) - savedTotal,
  );
  const defaultServings = getPutAwayServings(left);
  const containers =
    details === null
      ? 1
      : Math.min(details.containers, getContainerCountMax(details.servings));
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
      await putAway(
        splitServings(details.servings, containers).map((each) => ({
          title: recipe.title,
          recipeId: recipe.id,
          mealId: null,
          cookId,
          madeServings: servings,
          servings: each,
          place: details.place,
          eatBy,
        })),
      );
      setDetails(null);
      setIsSaving(false);
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this container.'));
      setIsSaving(false);
    }
  };

  return {
    isAvailable: isReady && cookId !== null,
    isAsking:
      isBulkMeal({ servings, care, hasStock }) &&
      left > 0 &&
      !isDismissed &&
      saved.length === 0,
    saved,
    isOpen: details !== null,
    isSaving,
    error,
    canSave: isValid,
    hasDraft:
      details !== null &&
      !isSaving &&
      (details.servings !== defaultServings ||
        details.containers !== 1 ||
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
            containers,
            setContainers: (next: number) => update({ containers: next }),
            maxContainers: getContainerCountMax(details.servings),
            splitText: getSplitText(details.servings, containers),
            basis: getPutAwayBasis({
              made: servings,
              eatenTonight,
              saved: savedTotal,
            }),
            overNote:
              savedTotal + details.servings > Math.round(servings)
                ? `That's more than the ${Math.round(servings)} you made.`
                : null,
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
        containers: 1,
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
