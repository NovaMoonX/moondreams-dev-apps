import { useState } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { addNote } from '@apps/pinch/store/actions/noteActions';
import {
  selectNoteSummaries,
  selectNotesLoadError,
} from '@apps/pinch/store/selectors';
import { isNoteHistoryFull, isValidNoteText } from '@apps/pinch/utils/notes';

interface UseCookNoteInput {
  uid: string;
  recipeId: string;
  /** The cook the note follows up; null until the cook has been written. */
  cookId: string | null;
}

/** The note typed on the cooking screen's last panel, which confirms it in place rather than with a toast. */
export function useCookNote({ uid, recipeId, cookId }: UseCookNoteInput) {
  const dispatch = useAppDispatch();
  const isNotesReady = useAppSelector(
    (state) =>
      state.pinch.notes.isLoaded && selectNotesLoadError(state) === null,
  );
  const isFull = useAppSelector((state) =>
    isNoteHistoryFull(selectNoteSummaries(state).get(recipeId)?.count ?? 0),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setIsOpen(false);
    setText('');
    setError(null);
  };

  const reset = () => {
    close();
    setIsSaved(false);
  };

  const save = async () => {
    if (cookId === null || !isValidNoteText(text)) {
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await dispatch(addNote({ uid, recipeId, text, cookId })).unwrap();
      setIsSaved(true);
      setIsSaving(false);
      close();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this note.'));
      setIsSaving(false);
    }
  };

  return {
    isAvailable: isNotesReady && !isFull,
    isOpen,
    isSaved,
    hasDraft: cookId !== null && isOpen && !isSaving && text.trim() !== '',
    canSave: isValidNoteText(text),
    text,
    setText,
    isSaving,
    error,
    open: () => setIsOpen(true),
    cancel: close,
    reset,
    save,
  };
}
