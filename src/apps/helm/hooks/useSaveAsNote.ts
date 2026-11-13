import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { store } from '@/store';
import { toComparable } from '@/utils/optionMatchUtils';
import { HELM_COPY, NOTE_BODY_MAX, NOTE_TITLE_MAX } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { createNote } from '@apps/helm/store/actions/noteActions';

const toTitle = (text: string) =>
  (text.split('\n').find((line) => line.trim() !== '') ?? '')
    .trim()
    .slice(0, NOTE_TITLE_MAX);

/** Keeps typed words that are too long for a turn as a note, with no reading by the assistant. Returns whether the words were taken (kept, or already in the notes). */
export function useSaveAsNote(onOpen: (noteId: string) => void) {
  const { user } = useAuth();
  const { addToast } = useToast();

  return async (text: string): Promise<boolean> => {
    const body = text.trim();
    const { notes } = store.getState().helm;
    if (
      !user ||
      !notes.isLoaded ||
      body === '' ||
      body.length > NOTE_BODY_MAX
    ) {
      return false;
    }
    const title = toTitle(body);
    const kept = notes.items.find(
      (note) =>
        !note.isUnreadable && toComparable(note.body) === toComparable(body),
    );
    if (kept) {
      addToast({
        title: HELM_COPY.noteAlreadyKept(kept.title || title),
        type: 'info',
        action: { label: HELM_COPY.noteOpen, onClick: () => onOpen(kept.id) },
      });
      return true;
    }
    try {
      const encryption = await getHelmEncryption(user.uid);
      const result = await createNote(
        user.uid,
        encryption,
        { title, body, topicIds: [] },
        notes.items.length,
      );
      if (result.kind !== 'made') {
        addToast({
          title:
            result.kind === 'full'
              ? HELM_COPY.notesFull
              : HELM_COPY.noteNeedsWords,
          type: 'info',
        });
        return false;
      }
      result.written.catch((error: unknown) => {
        console.error('Helm note was not saved', error);
        addToast({ title: HELM_COPY.heldActionFailed, type: 'error' });
      });
      addToast({
        title: HELM_COPY.noteSavedFromText(title),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void result
              .undo()
              .then((isUndone) => {
                if (!isUndone) {
                  addToast({ title: HELM_COPY.undoChangedSince, type: 'info' });
                }
              })
              .catch((error: unknown) => {
                console.error('Helm note was not put back', error);
                addToast({ title: HELM_COPY.noteUndoFailed, type: 'error' });
              }),
        },
      });
      return true;
    } catch (error) {
      console.error('Helm note was not saved', error);
      addToast({ title: HELM_COPY.heldActionFailed, type: 'error' });
      return false;
    }
  };
}
