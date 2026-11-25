import { useCallback, useMemo, useState } from 'react';

import {
  BookOpen,
  CalendarDays,
  Flame,
  Lightbulb,
  Pencil,
  ShoppingBasket,
} from 'lucide-react';

import type {
  DoneForYouDoor,
  DoneForYouEntry,
} from '@/components/DoneForYouSheet';
import { useAppSelector } from '@/store';
import { OUTSIDE_CHANGES_WORDS as WORDS } from '@apps/pinch/constants';
import { undoOutsideChange } from '@apps/pinch/store/actions/outsideChangeActions';
import {
  selectIdeasById,
  selectIngredientRecordsById,
  selectIngredientsById,
  selectNotesByRecipe,
  selectOutsideChanges,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { PinchOutsideChange } from '@apps/pinch/types';
import { getUndoableTweakIds } from '@apps/pinch/utils/notes';

const seenKey = (uid: string) => `pinch.outsideChangesSeen.${uid}`;

const readSeen = (uid: string) => {
  try {
    return Number(localStorage.getItem(seenKey(uid))) || 0;
  } catch {
    return 0;
  }
};

/** The assistant's own name, as a row leads with it. */
const getRowWho = (by: PinchOutsideChange['by']) =>
  by.name ?? (by.kind === 'assistant' ? 'An assistant' : "Helm's assistant");

/** "Gemini, through Helm", or the assistant's own name for Nomos. */
const getWho = (by: PinchOutsideChange['by']) =>
  by.kind === 'assistant'
    ? `${by.name ?? 'An assistant'}, through Helm`
    : (by.name ?? "Helm's assistant");

const getLook = (change: PinchOutsideChange) => {
  const made = change.createdIngredientIds?.length ?? 0;
  switch (change.kind) {
    case 'recipeUpdated':
      return {
        title: WORDS.recipeUpdated(change.title),
        undoLabel:
          made === 0
            ? WORDS.undoRecipeUpdated
            : WORDS.undoRecipeUpdatedWithNew(made),
        icon: <Pencil />,
      };
    case 'recipeAdded':
      return {
        title: WORDS.recipeAdded(change.title),
        undoLabel:
          made === 0
            ? WORDS.undoRecipeAdded
            : WORDS.undoRecipeAddedWithNew(made),
        icon: <BookOpen />,
      };
    case 'mealPlanned':
      return {
        title: WORDS.mealPlanned(change.title),
        undoLabel: WORDS.undoMealPlanned,
        icon: <CalendarDays />,
      };
    case 'shoppingAdded':
      return {
        title: WORDS.shoppingAdded(change.title),
        undoLabel:
          made > 0
            ? WORDS.undoShoppingAddedWithNew
            : change.addedAmount === null
              ? WORDS.undoShoppingAdded
              : WORDS.undoShoppingMerged,
        icon: <ShoppingBasket />,
      };
    case 'ideaSaved':
      return {
        title: WORDS.ideaSaved(change.title),
        undoLabel: WORDS.undoIdeaSaved,
        icon: <Lightbulb />,
      };
    case 'nutritionFilled':
      return {
        title: WORDS.nutritionFilled(change.title),
        undoLabel: WORDS.undoNutritionFilled,
        icon: <Flame />,
      };
  }
};

interface OutsideChangesOptions {
  uid: string;
  openRecipe: (recipeId: string) => void;
  openShopping: () => void;
  openIdea: (ideaId: string) => void;
  openIngredient: (ingredientId: string) => void;
}

/** What outside assistants changed in the kitchen, shaped for the shared Done for you sheet, with its Undo and the unseen dot. */
export function useOutsideChanges({
  uid,
  openRecipe,
  openShopping,
  openIdea,
  openIngredient,
}: OutsideChangesOptions) {
  const changes = useAppSelector(selectOutsideChanges);
  const isReady = useAppSelector(
    (state) =>
      state.pinch.outsideChanges.isLoaded &&
      state.pinch.outsideChanges.loadError === null,
  );
  const recipes = useAppSelector(selectRecipesById);
  const notesByRecipe = useAppSelector(selectNotesByRecipe);
  const ideasById = useAppSelector(selectIdeasById);
  const ingredients = useAppSelector(selectIngredientsById);
  const records = useAppSelector(selectIngredientRecordsById);
  const [seen, setSeen] = useState<{ uid: string; at: number } | null>(null);
  const seenAt = seen?.uid === uid ? seen.at : readSeen(uid);

  const items = useMemo((): DoneForYouEntry[] => {
    const getDoors = (change: PinchOutsideChange): DoneForYouDoor[] => {
      const { ideaId } = change;
      if (change.kind === 'ideaSaved' && ideaId != null) {
        return [
          {
            label: WORDS.openIdea,
            subtitle: WORDS.openIdeaSub,
            icon: <Lightbulb />,
            unavailable: ideasById.has(ideaId) ? undefined : WORDS.ideaGone,
            onSelect: () => openIdea(ideaId),
          },
        ];
      }
      const filled = change.filledNutrition ?? [];
      if (change.kind === 'nutritionFilled' && filled.length === 1) {
        const { ingredientId } = filled[0];
        return [
          {
            label: WORDS.openIngredient,
            subtitle: WORDS.openIngredientSub,
            icon: <Flame />,
            unavailable: ingredients.has(ingredientId)
              ? undefined
              : WORDS.ingredientGone,
            onSelect: () => openIngredient(ingredientId),
          },
        ];
      }
      const { recipeId } = change;
      if (recipeId !== null) {
        return [
          {
            label: WORDS.openRecipe,
            subtitle: WORDS.openRecipeSub,
            icon: <BookOpen />,
            unavailable: recipes.has(recipeId) ? undefined : WORDS.recipeGone,
            onSelect: () => openRecipe(recipeId),
          },
        ];
      }
      if (change.kind !== 'shoppingAdded') return [];
      return [
        {
          label: WORDS.openShopping,
          subtitle: WORDS.openShoppingSub,
          icon: <ShoppingBasket />,
          onSelect: openShopping,
        },
      ];
    };

    const isRecipeUndoable = (change: PinchOutsideChange) => {
      const recipe =
        change.recipeId === null ? undefined : recipes.get(change.recipeId);
      if (!recipe || change.noteId === null) return false;
      const tweaks = (notesByRecipe.get(recipe.id) ?? []).filter(
        (note) => note.kind === 'TWEAK',
      );
      return getUndoableTweakIds(tweaks, recipe.updatedAt).includes(
        change.noteId,
      );
    };

    const isIdeaUndoable = (change: PinchOutsideChange) => {
      const idea = ideasById.get(change.ideaId ?? '');
      return (
        idea !== undefined &&
        idea.updatedAt === idea.createdAt &&
        idea.recipeId === null
      );
    };

    const isNutritionUndoable = (change: PinchOutsideChange) =>
      (change.filledNutrition ?? []).every(
        ({ ingredientId }) => records.get(ingredientId)?.nutritionBy != null,
      );

    const getStaleNote = (change: PinchOutsideChange) => {
      if (change.kind === 'recipeUpdated' && !isRecipeUndoable(change)) {
        return WORDS.recipeChangedAfter;
      }
      if (change.kind === 'ideaSaved' && !isIdeaUndoable(change)) {
        return WORDS.ideaChangedAfter;
      }
      if (change.kind === 'nutritionFilled' && !isNutritionUndoable(change)) {
        return WORDS.nutritionChangedAfter;
      }
      return null;
    };

    return changes.map((change) => {
      const look = getLook(change);
      const isUndone = change.undoneAt !== null;
      const staleNote = getStaleNote(change);
      const isStale = staleNote !== null;
      const isCounted =
        change.lines.length > 1 && change.kind.startsWith('recipe');
      const heroLines = isCounted ? change.lines : change.lines.slice(1);
      return {
        id: change.id,
        createdAt: change.createdAt,
        title: look.title,
        detail: isCounted
          ? `${change.lines.length} changes`
          : (change.lines[0] ?? null),
        whyLine: getWho(change.by),
        rowLead: getRowWho(change.by),
        canUndo: !isUndone && !isStale,
        isUndone,
        note:
          staleNote ??
          ((change.createdIngredientIds?.length ?? 0) > 0
            ? WORDS.newIngredientKept
            : null),
        rowNote: null,
        undoLabel: look.undoLabel,
        kindIcon: look.icon,
        hero:
          heroLines.length > 0 ? (
            <ul className='border-border bg-card list-disc space-y-1 rounded-2xl border py-3 pr-3 pl-7 text-sm'>
              {heroLines.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          ) : undefined,
        doors: getDoors(change),
        undoneAt: change.undoneAt,
      };
    });
  }, [
    changes,
    recipes,
    notesByRecipe,
    ideasById,
    ingredients,
    records,
    openRecipe,
    openShopping,
    openIdea,
    openIngredient,
  ]);

  const newest = changes.reduce(
    (time, change) => Math.max(time, change.createdAt),
    0,
  );

  const markSeen = useCallback(() => {
    if (newest === 0) return;
    setSeen({ uid, at: newest });
    try {
      localStorage.setItem(seenKey(uid), String(newest));
    } catch {
      // Without storage the dot comes back on the next visit.
    }
  }, [newest, uid]);

  return {
    items,
    isReady,
    hasUnseen: newest > seenAt,
    markSeen,
    undo: undoOutsideChange,
  };
}
