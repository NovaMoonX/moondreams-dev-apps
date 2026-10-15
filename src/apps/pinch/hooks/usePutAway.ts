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
import type { Container, ContainerPlace, Recipe } from '@apps/pinch/types';
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

export interface PutAwayEntry {
  recipe: Recipe;
  servings: number;
  eatenTonight: number | null;
  /** Null until the cook exists. */
  cookId: string | null;
}

interface UsePutAwayInput {
  uid: string;
  /** One per recipe cooked on this screen; only one can have its details open at a time. */
  entries: PutAwayEntry[];
}

interface Details {
  recipeId: string;
  place: ContainerPlace;
  openedPlace: ContainerPlace;
  isPlaceFixed: boolean;
  servings: number;
  containers: number;
  typedEatBy: string | null;
}

interface Save {
  ids: string[];
  isOffline: boolean;
}

type UndoState = 'PENDING' | 'FAILED';

const NO_CONTAINERS: never[] = [];

export function usePutAway({ uid, entries }: UsePutAwayInput) {
  const { putAway, undoSaved } = useContainerActions(uid);
  const isReady = useAppSelector(selectIsContainersReady);
  const stockByRecipe = useAppSelector(selectStockByRecipe);
  const containersByCookId = useAppSelector(selectContainersByCookId);
  const [details, setDetails] = useState<Details | null>(null);
  const [dismissedCookIds, setDismissedCookIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saves, setSaves] = useState<Save[]>([]);
  const [undoStates, setUndoStates] = useState<Record<string, UndoState>>({});
  const [notice, setNotice] = useState<{
    recipeId: string;
    text: string;
  } | null>(null);

  const measure = (entry: PutAwayEntry) => {
    const saved: Container[] =
      entry.cookId === null
        ? NO_CONTAINERS
        : (containersByCookId.get(entry.cookId) ?? NO_CONTAINERS);
    const savedTotal = saved.reduce(
      (sum, container) => sum + (getStartServings(container) ?? 0),
      0,
    );
    const left = Math.floor(
      entry.servings -
        (entry.eatenTonight ?? CONTAINER_SITTING_SERVINGS) -
        savedTotal,
    );
    return {
      saved,
      savedTotal,
      left,
      defaultServings: getPutAwayServings(left),
    };
  };

  const openEntry =
    details === null
      ? null
      : (entries.find((entry) => entry.recipe.id === details.recipeId) ?? null);
  const open = openEntry === null ? null : measure(openEntry);
  const care = openEntry === null ? null : getRecipeCare(openEntry.recipe);
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
    if (
      details === null ||
      openEntry === null ||
      eatBy === null ||
      !isValid ||
      openEntry.cookId === null
    ) {
      return;
    }
    const { recipe, servings, cookId } = openEntry;
    const onWriteFailed = (text: string) =>
      setNotice({ recipeId: recipe.id, text });
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const created = await putAway(
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
        { withToast: false, onWriteFailed },
      );
      setSaves((current) => [
        ...current,
        { ids: created.map(({ id }) => id), isOffline: !navigator.onLine },
      ]);
      setDetails(null);
      setIsSaving(false);
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this container.'));
      setIsSaving(false);
    }
  };

  const getSave = (batch: Container[]) =>
    saves.find((save) => save.ids.includes(batch[0].id)) ?? null;

  const undo = async (batch: Container[]) => {
    const save = getSave(batch);
    if (save === null || undoStates[save.ids[0]] !== undefined) return;

    const key = save.ids[0];
    const recipeId = batch[0].recipeId ?? '';
    setNotice(null);
    setUndoStates((current) => ({ ...current, [key]: 'PENDING' }));
    try {
      await undoSaved(save.ids);
    } catch (undoError) {
      setUndoStates((current) => ({ ...current, [key]: 'FAILED' }));
      setNotice({
        recipeId,
        text: `Couldn't undo that. ${getErrorMessage(undoError, 'You can change it in Fridge & freezer.')}`,
      });
    }
  };

  const dismissCook = (cookId: string | null) => {
    if (cookId !== null) {
      setDismissedCookIds((current) => [...current, cookId]);
    }
  };

  const getEntry = (recipeId: string) => {
    const entry = entries.find((candidate) => candidate.recipe.id === recipeId);
    if (!entry) {
      return null;
    }

    const { saved, left, defaultServings } = measure(entry);
    const isBulk = isBulkMeal({
      servings: entry.servings,
      care: getRecipeCare(entry.recipe),
      hasStock: stockByRecipe.has(recipeId),
    });
    const isDismissed =
      entry.cookId !== null && dismissedCookIds.includes(entry.cookId);
    const result = {
      isAvailable: isReady && entry.cookId !== null,
      isBulk,
      /** A first put-away is always offered; another only while something is left. */
      canOffer: saved.length === 0 || left > 0,
      isAsking: isBulk && left > 0 && !isDismissed && saved.length === 0,
      saved,
      notice: notice?.recipeId === recipeId ? notice.text : null,
      open: (place: ContainerPlace, isPlaceFixed = true) => {
        setError(null);
        setNotice(null);
        setDetails({
          recipeId,
          place,
          openedPlace: place,
          isPlaceFixed,
          servings: defaultServings,
          containers: 1,
          typedEatBy: null,
        });
      },
      dismiss: () => dismissCook(entry.cookId),
    };
    return result;
  };

  return {
    /** What one recipe's put-away card shows and can do. */
    getEntry,
    getUndo: (batch: Container[]) => {
      const save = getSave(batch);
      return save === null
        ? null
        : {
            state: undoStates[save.ids[0]] ?? null,
            isOffline: save.isOffline,
          };
    },
    undo,
    openRecipeId: openEntry === null ? null : openEntry.recipe.id,
    isOpen: openEntry !== null,
    isSaving,
    error,
    canSave: isValid,
    hasDraft:
      details !== null &&
      open !== null &&
      !isSaving &&
      (details.servings !== open.defaultServings ||
        details.containers !== 1 ||
        details.typedEatBy !== null ||
        details.place !== details.openedPlace),
    fields:
      details === null || openEntry === null || open === null
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
              made: openEntry.servings,
              eatenTonight: openEntry.eatenTonight,
              saved: open.savedTotal,
            }),
            overNote:
              open.savedTotal + details.servings >
              Math.round(openEntry.servings)
                ? `That's more than the ${Math.round(openEntry.servings)} you made.`
                : null,
            eatByText,
            setEatByText: (text: string) => update({ typedEatBy: text }),
            hint: getEatByHint(move, preset),
          },
    isPlaceFixed: details?.isPlaceFixed ?? false,
    skip: () => {
      setDetails(null);
      setError(null);
      dismissCook(openEntry?.cookId ?? null);
    },
    save,
  };
}
