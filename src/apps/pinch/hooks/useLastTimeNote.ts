import { useAppSelector } from '@/store';
import {
  selectNotesByRecipe,
  selectNotesLoadError,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';
import { getLastTimeNote } from '@apps/pinch/utils/notes';

const NO_NOTES: RecipeNote[] = [];
const NO_STEPS: string[] = [];

/** The note the first step leads with, once the notes have loaded; null elsewhere. */
export function useLastTimeNote(recipeId: string | null) {
  const notes =
    useAppSelector(selectNotesByRecipe).get(recipeId ?? '') ?? NO_NOTES;
  const isNotesReady = useAppSelector(
    (state) =>
      state.pinch.notes.isLoaded && selectNotesLoadError(state) === null,
  );
  const steps =
    useAppSelector(selectRecipesById).get(recipeId ?? '')?.steps ?? NO_STEPS;
  const result =
    recipeId !== null && isNotesReady ? getLastTimeNote(notes, steps) : null;

  return result;
}
