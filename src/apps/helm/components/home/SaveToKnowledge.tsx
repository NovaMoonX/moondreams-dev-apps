import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { BookmarkPlus } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import SavedNoteLine from '@apps/helm/components/home/SavedNoteLine';
import NoteSheet from '@apps/helm/components/knowledge/NoteSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  saveAnswerAsNote,
  undoSavedAnswer,
} from '@apps/helm/store/actions/noteActions';
import { selectNoteById } from '@apps/helm/store/selectors/knowledgeSelectors';
import type { CaptureAnswer } from '@apps/helm/types';
import { planSavedAnswer } from '@apps/helm/utils/savedAnswer';

interface SaveToKnowledgeProps {
  captureId: string;
  savedNoteId: string | null;
  answer: CaptureAnswer;
}

/** Keeps a general answer as a note in one tap, with no form: filed where it plainly belongs, otherwise loose with the question of which topic. A body the person already keeps saves nothing. */
function SaveToKnowledge({
  captureId,
  savedNoteId,
  answer,
}: SaveToKnowledgeProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const notes = useAppSelector((state) => state.helm.notes);
  const topics = useAppSelector((state) => state.helm.topics);
  const noteById = useAppSelector(selectNoteById);
  const inFlight = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [keptId, setKeptId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const saved = savedNoteId ? (noteById.get(savedNoteId) ?? null) : null;
  const kept = keptId ? (noteById.get(keptId) ?? null) : null;

  const save = async () => {
    if (!user || inFlight.current || !notes.isLoaded || !topics.isLoaded) {
      return;
    }
    inFlight.current = true;
    setIsSaving(true);
    try {
      const plan = planSavedAnswer(answer, notes.items, topics.items);
      if (plan.kind === 'kept') {
        setKeptId(plan.note.id);
      } else {
        const result = await saveAnswerAsNote(
          user.uid,
          await getHelmEncryption(user.uid),
          {
            captureId,
            title: plan.title,
            body: plan.body,
            isHealth: answer.isHealth,
            topic: plan.topic,
            noteCount: notes.items.length,
          },
        );
        if (result.kind === 'saved') {
          setIsAsking(plan.topic === null);
          result.written
            .catch((error: unknown) => {
              console.error('Helm answer was not saved', error);
              addToast({ title: HELM_COPY.saveFailed, type: 'error' });
            })
            .finally(() => setIsSaving(false));
          inFlight.current = false;
          return;
        }
        addToast({
          title:
            result.kind === 'full' ? HELM_COPY.notesFull : HELM_COPY.saveFailed,
          type: 'info',
        });
      }
    } catch (error) {
      console.error('Helm answer was not saved', error);
      addToast({ title: HELM_COPY.saveFailed, type: 'error' });
    }
    inFlight.current = false;
    setIsSaving(false);
  };

  const undo = async () => {
    if (!user || !saved || isUndoing) return;
    setIsUndoing(true);
    try {
      const result = await undoSavedAnswer(user.uid, captureId, saved.id);
      if (result !== 'undone') {
        addToast({
          title:
            result === 'offline'
              ? HELM_COPY.editNeedsConnection
              : HELM_COPY.savedUndoEdited,
          type: 'info',
        });
      }
    } catch (error) {
      console.error('Helm saved answer was not taken back', error);
      addToast({ title: HELM_COPY.undoFailed, type: 'error' });
    }
    setIsUndoing(false);
  };

  if (saved) {
    return (
      <SavedNoteLine
        note={saved}
        isAsking={isAsking}
        onAnswered={() => setIsAsking(false)}
        onUndo={() => void undo()}
        isUndoing={isUndoing}
      />
    );
  }
  if (kept) {
    return (
      <div className='flex items-center gap-2'>
        <p className='min-w-0 flex-1 text-[15px] break-words'>
          {HELM_COPY.saveAlreadyKept(kept.title || HELM_COPY.noteUntitled)}
        </p>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          onClick={() => setIsOpen(true)}
        >
          {HELM_COPY.saveAlreadyKeptOpen}
        </Button>
        <NoteSheet
          noteId={isOpen ? kept.id : null}
          onClose={() => setIsOpen(false)}
        />
      </div>
    );
  }
  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      className='self-start'
      loading={isSaving || !notes.isLoaded || !topics.isLoaded}
      onClick={() => void save()}
    >
      <BookmarkPlus className='size-4' aria-hidden='true' />
      {HELM_COPY.saveToKnowledge}
    </Button>
  );
}

export default SaveToKnowledge;
