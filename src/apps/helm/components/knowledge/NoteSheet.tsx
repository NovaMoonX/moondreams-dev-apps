import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import CopyTextButton from '@/components/CopyTextButton';
import DeleteIconButton from '@/components/DeleteIconButton';
import DetailSheet from '@/components/DetailSheet';
import LinkedText from '@/components/LinkedText';
import ModalFooterActions from '@/components/ModalFooterActions';
import Pill from '@/components/Pill';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import NoteForm from '@apps/helm/components/knowledge/NoteForm';
import { HELM_COPY } from '@apps/helm/constants';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { deleteNote } from '@apps/helm/store/actions/noteActions';
import {
  selectNoteById,
  selectTopicById,
} from '@apps/helm/store/selectors/knowledgeSelectors';

interface NoteSheetProps {
  /** The note to show, read live from the store; null keeps the sheet closed. A note that is gone closes it. */
  noteId: string | null;
  onClose: () => void;
}

/** One note: its words with tappable links, where it came from, its topics, and Copy, Edit and Delete. */
function NoteSheet({ noteId, onClose }: NoteSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const { showView } = useHelmUrlState();
  const note = useAppSelector(selectNoteById).get(noteId ?? '') ?? null;
  const topicById = useAppSelector(selectTopicById);
  const [isEditing, setIsEditing] = useState(false);
  const title = note ? note.title || HELM_COPY.noteUntitled : '';

  const remove = async () => {
    if (!user || !note) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.noteDeleteAction,
      message: HELM_COPY.noteDeleteConfirm(title),
      confirmText: HELM_COPY.noteDeleteAction,
      destructive: true,
    });
    if (!isConfirmed) return;
    try {
      const { write, restore } = await deleteNote(user.uid, note.id);
      write.catch((error: unknown) => {
        console.error('Helm note was not deleted', error);
        addToast({ title: HELM_COPY.noteDeleteFailed, type: 'error' });
      });
      onClose();
      addToast({
        title: HELM_COPY.noteDeletedToast(title),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void restore().then(
              (outcome) =>
                addToast({
                  title:
                    outcome === 'exists'
                      ? HELM_COPY.restoreExists
                      : HELM_COPY.noteDeletedBack(title),
                  type: 'info',
                }),
              (error: unknown) => {
                console.error('Helm deleted note was not restored', error);
                addToast({ title: HELM_COPY.noteUndoFailed, type: 'error' });
              },
            ),
        },
      });
    } catch (error) {
      console.error('Helm note was not deleted', error);
      addToast({ title: HELM_COPY.noteDeleteFailed, type: 'error' });
    }
  };

  const topics = (note?.topicIds ?? []).flatMap((id) => {
    const topic = topicById.get(id);
    return topic ? [topic] : [];
  });
  const origin = note
    ? [
        note.source === 'typed'
          ? HELM_COPY.noteWrote(formatDateShort(note.createdAt))
          : HELM_COPY.noteAdded(formatDateShort(note.createdAt)),
        ...(note.lastEditedAt !== null
          ? [HELM_COPY.noteChangedOn(formatDateShort(note.lastEditedAt))]
          : []),
      ]
    : [];

  return (
    <>
      <DetailSheet
        isOpen={note !== null && !isEditing}
        onClose={onClose}
        title={title}
        footer={
          note && (
            <div className='px-6 pt-2 pb-3'>
              <ModalFooterActions
                leftActions={
                  <DeleteIconButton
                    label={HELM_COPY.noteDelete}
                    onClick={() => void remove()}
                  />
                }
                rightActions={
                  <>
                    <CopyTextButton
                      variant='secondary'
                      label={HELM_COPY.noteCopy}
                      text={[note.title, note.body]
                        .filter(Boolean)
                        .join('\n\n')}
                    />
                    <Button
                      type='button'
                      variant='secondary'
                      onClick={() => setIsEditing(true)}
                    >
                      {HELM_COPY.noteEdit}
                    </Button>
                  </>
                }
              />
            </div>
          )
        }
      >
        {note && (
          <div className='space-y-4'>
            {note.body && (
              <LinkedText text={note.body} className='text-[15px]' />
            )}
            <p className='text-muted-foreground text-[13px]'>
              {origin.join(' · ')}
            </p>
            {topics.length > 0 && (
              <div className='flex flex-wrap gap-2'>
                {topics.map((topic) => (
                  <Pill
                    key={topic.id}
                    isSelected={false}
                    emoji={topic.emoji ?? undefined}
                    onClick={() =>
                      afterBackLayersClose(
                        () => void showView('topic', topic.id),
                      )
                    }
                  >
                    {topic.name}
                  </Pill>
                ))}
              </div>
            )}
          </div>
        )}
      </DetailSheet>
      <NoteForm
        isOpen={note !== null && isEditing}
        onClose={() => setIsEditing(false)}
        onSaved={onClose}
        note={note}
      />
    </>
  );
}

export default NoteSheet;
