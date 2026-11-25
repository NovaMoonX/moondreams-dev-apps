import { useCallback, useMemo, useState } from 'react';

import { BookOpen, CalendarDays, Pencil, ShoppingBasket } from 'lucide-react';

import type {
  DoneForYouDoor,
  DoneForYouEntry,
} from '@/components/DoneForYouSheet';
import { useAppSelector } from '@/store';
import { OUTSIDE_CHANGES_WORDS as WORDS } from '@apps/pinch/constants';
import { undoOutsideChange } from '@apps/pinch/store/actions/outsideChangeActions';
import {
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
  switch (change.kind) {
    case 'recipeUpdated':
      return {
        title: WORDS.recipeUpdated(change.title),
        undoLabel: WORDS.undoRecipeUpdated,
        icon: <Pencil />,
      };
    case 'recipeAdded':
      return {
        title: WORDS.recipeAdded(change.title),
        undoLabel: WORDS.undoRecipeAdded,
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
          change.addedAmount === null
            ? WORDS.undoShoppingAdded
            : WORDS.undoShoppingMerged,
        icon: <ShoppingBasket />,
      };
  }
};

interface OutsideChangesOptions {
  uid: string;
  openRecipe: (recipeId: string) => void;
  openShopping: () => void;
}

/** What outside assistants changed in the kitchen, shaped for the shared Done for you sheet, with its Undo and the unseen dot. */
export function useOutsideChanges({
  uid,
  openRecipe,
  openShopping,
}: OutsideChangesOptions) {
  const changes = useAppSelector(selectOutsideChanges);
  const isReady = useAppSelector(
    (state) =>
      state.pinch.outsideChanges.isLoaded &&
      state.pinch.outsideChanges.loadError === null,
  );
  const recipes = useAppSelector(selectRecipesById);
  const notesByRecipe = useAppSelector(selectNotesByRecipe);
  const [seen, setSeen] = useState<{ uid: string; at: number } | null>(null);
  const seenAt = seen?.uid === uid ? seen.at : readSeen(uid);

  const items = useMemo((): DoneForYouEntry[] => {
    const getDoors = (change: PinchOutsideChange): DoneForYouDoor[] => {
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

    return changes.map((change) => {
      const look = getLook(change);
      const isUndone = change.undoneAt !== null;
      const isStale =
        change.kind === 'recipeUpdated' && !isRecipeUndoable(change);
      return {
        id: change.id,
        createdAt: change.createdAt,
        title: look.title,
        detail:
          change.lines.length > 1
            ? `${change.lines.length} changes`
            : (change.lines[0] ?? null),
        whyLine: getWho(change.by),
        rowLead: getRowWho(change.by),
        canUndo: !isUndone && !isStale,
        isUndone,
        note: isStale ? WORDS.recipeChangedAfter : null,
        rowNote: null,
        undoLabel: look.undoLabel,
        kindIcon: look.icon,
        hero:
          change.lines.length > 1 ? (
            <ul className='border-border bg-card list-disc space-y-1 rounded-2xl border py-3 pr-3 pl-7 text-sm'>
              {change.lines.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          ) : undefined,
        doors: getDoors(change),
        undoneAt: change.undoneAt,
      };
    });
  }, [changes, recipes, notesByRecipe, openRecipe, openShopping]);

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
