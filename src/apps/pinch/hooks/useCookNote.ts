import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { addNote } from '@apps/pinch/store/actions/noteActions';
import { selectNoteSummaries } from '@apps/pinch/store/selectors';
import { isNoteHistoryFull, isValidNoteText } from '@apps/pinch/utils/notes';

interface UseCookNoteInput {
  uid: string;
  recipeId: string;
  recipeTitle: string;
  /** The cook the note follows up; null until the cook has been written. */
  cookId: string | null;
  onSaved: () => void;
}

export function useCookNote({
  uid,
  recipeId,
  recipeTitle,
  cookId,
  onSaved,
}: UseCookNoteInput) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const isNotesReady = useAppSelector(
    (state) =>
      state.pinch.notes.isLoaded && state.pinch.notes.loadError === null,
  );
  const isFull = useAppSelector((state) =>
    isNoteHistoryFull(selectNoteSummaries(state).get(recipeId)?.count ?? 0),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setIsOpen(false);
    setText('');
    setError(null);
  };

  const save = async () => {
    if (cookId === null || !isValidNoteText(text)) {
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await dispatch(addNote({ uid, recipeId, text, cookId })).unwrap();
      addToast({ title: `Added a note to ${recipeTitle}`, type: 'success' });
      onSaved();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this note.'));
      setIsSaving(false);
    }
  };

  return {
    isAvailable: isNotesReady && !isFull,
    isOpen,
    hasDraft: isOpen && text.trim() !== '',
    canSave: isValidNoteText(text),
    text,
    setText,
    isSaving,
    error,
    open: () => setIsOpen(true),
    cancel: reset,
    reset,
    save,
  };
}
