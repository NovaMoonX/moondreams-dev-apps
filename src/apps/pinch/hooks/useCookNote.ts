import { useState } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { addNote } from '@apps/pinch/store/actions/noteActions';
import {
  selectNoteSummaries,
  selectNotesLoadError,
} from '@apps/pinch/store/selectors';
import { isNoteHistoryFull, isValidNoteText } from '@apps/pinch/utils/notes';

interface CookNoteEntry {
  recipeId: string;
  /** The cook the note follows up; null until the cook has been written. */
  cookId: string | null;
}

interface UseCookNoteInput {
  uid: string;
  /** One per recipe cooked on this screen; one note box is open at a time. */
  entries: CookNoteEntry[];
}

/** The note typed on the cooking screen's last panel, which confirms it in place rather than with a toast. */
export function useCookNote({ uid, entries }: UseCookNoteInput) {
  const dispatch = useAppDispatch();
  const isNotesReady = useAppSelector(
    (state) =>
      state.pinch.notes.isLoaded && selectNotesLoadError(state) === null,
  );
  const noteSummaries = useAppSelector(selectNoteSummaries);
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openEntry =
    entries.find((entry) => entry.recipeId === openRecipeId) ?? null;

  const close = () => {
    setOpenRecipeId(null);
    setText('');
    setError(null);
  };

  const reset = () => {
    close();
    setSavedNotes({});
  };

  const save = async () => {
    if (
      openEntry === null ||
      openEntry.cookId === null ||
      !isValidNoteText(text)
    ) {
      return;
    }
    const { recipeId, cookId } = openEntry;
    setError(null);
    setIsSaving(true);
    try {
      const noteId = await dispatch(
        addNote({ uid, recipeId, text, cookId }),
      ).unwrap();
      setSavedNotes((current) => ({ ...current, [recipeId]: noteId }));
      setIsSaving(false);
      close();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this note.'));
      setIsSaving(false);
    }
  };

  return {
    isAvailable: (recipeId: string) =>
      isNotesReady &&
      !isNoteHistoryFull(noteSummaries.get(recipeId)?.count ?? 0),
    isSaved: (recipeId: string) => recipeId in savedNotes,
    /** The note this panel wrote for the recipe, or null. */
    getSavedNoteId: (recipeId: string) => savedNotes[recipeId] ?? null,
    openRecipeId: openEntry === null ? null : openEntry.recipeId,
    isOpen: openEntry !== null,
    hasDraft:
      openEntry !== null &&
      openEntry.cookId !== null &&
      !isSaving &&
      text.trim() !== '',
    canSave: isValidNoteText(text),
    text,
    setText,
    isSaving,
    error,
    open: (recipeId: string) => setOpenRecipeId(recipeId),
    cancel: close,
    reset,
    save,
  };
}
