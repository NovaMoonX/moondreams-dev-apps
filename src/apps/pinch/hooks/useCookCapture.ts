import { useState } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import type { WrittenNoteKind } from '@apps/pinch/components/notes/NoteKindPills';
import {
  addNote,
  removeNote,
  updateNote,
} from '@apps/pinch/store/actions/noteActions';
import {
  selectNoteSummaries,
  selectNotesById,
  selectNotesLoadError,
} from '@apps/pinch/store/selectors';
import {
  getStepAnchorText,
  isNoteHistoryFull,
  isValidNoteText,
  resolveNoteStep,
} from '@apps/pinch/utils/notes';

interface CaptureDraft {
  recipeId: string;
  /** The entry being changed; null writes a new one. */
  noteId: string | null;
  kind: WrittenNoteKind;
  text: string;
  reason: string;
  /** The step (0-based), or null for the whole recipe. */
  stepIndex: number | null;
  /** What the form held when it opened, to tell an edit from an untouched one. */
  initial: { text: string; reason: string; stepIndex: number | null };
}

interface OpenCaptureOptions {
  recipeId: string;
  stepIndex: number | null;
  kind?: WrittenNoteKind;
}

interface UseCookCaptureInput {
  uid: string;
  /** Entries written on this screen before it was saved and picked up again. */
  initialCaptured: string[];
  /** The cook a note follows up, once there is one; null before Finish. */
  getCookId: (recipeId: string) => string | null;
  /** The recipe's steps as they are now, to find a step an entry was written for. */
  getSteps: (recipeId: string) => string[];
}

/** The tips, notes and changes written while cooking: the one open composer, what this screen has written (for the review at Finish) and the writes. Entries are saved as they are written, so leaving the screen never loses one. */
export function useCookCapture({
  uid,
  initialCaptured,
  getCookId,
  getSteps,
}: UseCookCaptureInput) {
  const dispatch = useAppDispatch();
  const isNotesReady = useAppSelector(
    (state) =>
      state.pinch.notes.isLoaded && selectNotesLoadError(state) === null,
  );
  const noteSummaries = useAppSelector(selectNoteSummaries);
  const notesById = useAppSelector(selectNotesById);
  const [captured, setCaptured] = useState(initialCaptured);
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setDraft(null);
    setError(null);
  };

  const patch = (changes: Partial<CaptureDraft>) =>
    setDraft((current) => (current === null ? current : { ...current, ...changes }));

  const open = ({ recipeId, stepIndex, kind = 'TIP' }: OpenCaptureOptions) => {
    setError(null);
    setDraft({
      recipeId,
      noteId: null,
      kind,
      text: '',
      reason: '',
      stepIndex,
      initial: { text: '', reason: '', stepIndex },
    });
  };

  const edit = (noteId: string) => {
    const note = notesById.get(noteId);
    if (note === undefined || note.kind === 'TWEAK') return;
    const stepIndex = resolveNoteStep(note, getSteps(note.recipeId));
    const initial = {
      text: note.text ?? '',
      reason: note.reason ?? '',
      stepIndex,
    };
    setError(null);
    setDraft({
      recipeId: note.recipeId,
      noteId,
      kind: note.kind,
      ...initial,
      initial,
    });
  };

  const isEdited =
    draft !== null &&
    (draft.noteId === null
      ? draft.text.trim() !== ''
      : draft.text !== draft.initial.text ||
        draft.reason !== draft.initial.reason ||
        draft.stepIndex !== draft.initial.stepIndex);

  const save = async () => {
    if (draft === null || !isValidNoteText(draft.text)) return;
    setError(null);
    setIsSaving(true);
    try {
      if (draft.noteId === null) {
        const noteId = generateUuid();
        setCaptured((current) => [...current, noteId]);
        try {
          await dispatch(
            addNote({
              uid,
              id: noteId,
              recipeId: draft.recipeId,
              kind: draft.kind,
              text: draft.text,
              reason: draft.kind === 'CHANGE' ? draft.reason : null,
              cookId: draft.kind === 'TIP' ? null : getCookId(draft.recipeId),
              stepIndex: draft.stepIndex,
            }),
          ).unwrap();
        } catch (addError) {
          setCaptured((current) => current.filter((id) => id !== noteId));
          throw addError;
        }
      } else {
        await dispatch(
          updateNote({
            uid,
            id: draft.noteId,
            text: draft.text,
            reason: draft.kind === 'CHANGE' ? draft.reason : undefined,
            ...(draft.stepIndex === draft.initial.stepIndex
              ? {}
              : { stepIndex: draft.stepIndex }),
          }),
        ).unwrap();
      }
      setIsSaving(false);
      close();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this entry.'));
      setIsSaving(false);
    }
  };

  /** Writes an entry without the composer, for one dictated aloud. Resolves to its id, which the caller keeps if it should be able to take it back. */
  const quickAdd = async (input: {
    /** An id the caller minted, so it can offer to take the entry back before the write reaches the server. */
    id: string;
    recipeId: string;
    kind: WrittenNoteKind;
    text: string;
    stepIndex: number | null;
  }) => {
    const noteId = input.id;
    setCaptured((current) => [...current, noteId]);
    try {
      await dispatch(
        addNote({
          uid,
          id: noteId,
          recipeId: input.recipeId,
          kind: input.kind,
          text: input.text,
          reason: null,
          cookId: input.kind === 'TIP' ? null : getCookId(input.recipeId),
          stepIndex: input.stepIndex,
        }),
      ).unwrap();
    } catch (addError) {
      setCaptured((current) => current.filter((id) => id !== noteId));
      throw addError;
    }
    return noteId;
  };

  const removeById = async (noteId: string) => {
    await dispatch(removeNote({ uid, id: noteId })).unwrap();
    setCaptured((current) => current.filter((id) => id !== noteId));
  };

  const remove = async () => {
    if (draft === null || draft.noteId === null) return;
    const { noteId } = draft;
    setError(null);
    setIsSaving(true);
    try {
      await dispatch(removeNote({ uid, id: noteId })).unwrap();
      setCaptured((current) => current.filter((id) => id !== noteId));
      setIsSaving(false);
      close();
    } catch (removeError) {
      setError(getErrorMessage(removeError, 'Unable to delete this entry.'));
      setIsSaving(false);
    }
  };

  return {
    isAvailable: (recipeId: string) =>
      isNotesReady &&
      !isNoteHistoryFull(noteSummaries.get(recipeId)?.count ?? 0),
    /** The entries this screen has written, oldest first; one deleted elsewhere is left out by the caller. */
    captured,
    isOpen: draft !== null,
    draft,
    hasDraft: draft !== null && !isSaving && isEdited,
    canSave: draft !== null && isValidNoteText(draft.text) && isEdited,
    isSaving,
    error,
    /** What the open composer shows for the step it is on, for its caption. */
    getStepWords: (stepIndex: number | null) => {
      const step =
        draft === null || stepIndex === null
          ? undefined
          : getSteps(draft.recipeId)[stepIndex];
      return step === undefined ? null : getStepAnchorText(step);
    },
    open,
    edit,
    setKind: (kind: WrittenNoteKind) => patch({ kind }),
    setText: (text: string) => patch({ text }),
    setReason: (reason: string) => patch({ reason }),
    setStepIndex: (stepIndex: number | null) => patch({ stepIndex }),
    cancel: close,
    save,
    remove,
    quickAdd,
    removeById,
  };
}

export type CookCapture = ReturnType<typeof useCookCapture>;
