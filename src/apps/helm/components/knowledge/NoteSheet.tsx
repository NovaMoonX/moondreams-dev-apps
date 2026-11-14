import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Stethoscope } from 'lucide-react';

import CopyTextButton from '@/components/CopyTextButton';
import DeleteIconButton from '@/components/DeleteIconButton';
import DetailSheet from '@/components/DetailSheet';
import LinkedText from '@/components/LinkedText';
import MarkdownText from '@/components/MarkdownText';
import ModalFooterActions from '@/components/ModalFooterActions';
import Pill from '@/components/Pill';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import KeptMediaSection from '@apps/helm/components/media/KeptMediaSection';
import NoteForm from '@apps/helm/components/knowledge/NoteForm';
import { NoteTopicsFields } from '@apps/helm/components/knowledge/NoteTopicsSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import {
  deleteNote,
  markNoteChecked,
} from '@apps/helm/store/actions/noteActions';
import {
  selectAllTopics,
  selectNoteById,
  selectTopicById,
} from '@apps/helm/store/selectors/knowledgeSelectors';
import PrivateRow from '@apps/helm/components/privacy/PrivateRow';
import { filterPrivateOwnPage } from '@apps/helm/utils/privacy';

interface NoteSheetProps {
  /** The note to show, read live from the store; null keeps the sheet closed. A note that is gone closes it and calls `onClose`. */
  noteId: string | null;
  onClose: () => void;
}

const LEADING_H1 = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/;

const withoutTitleHeading = (body: string, title: string) => {
  const heading = LEADING_H1.exec(body);
  return heading && heading[1].trim().slice(0, 80) === title
    ? body.slice(heading[0].length).trimStart()
    : body;
};

/** One note: its words with tappable links, where it came from, its topics, and Copy, Edit and Delete. */
function NoteSheet({ noteId, onClose }: NoteSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const { showView } = useHelmUrlState();
  const note = useAppSelector(selectNoteById).get(noteId ?? '') ?? null;
  const topicById = useAppSelector(selectTopicById);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filingId, setFilingId] = useState<string | null>(null);
  const isEditing = editingId === note?.id;
  const isFiling = filingId === note?.id;
  const title = note ? note.title || HELM_COPY.noteUntitled : '';

  useEffect(() => {
    if (!noteId) return;
    return store.subscribe(() => {
      if (selectNoteById(store.getState()).has(noteId)) return;
      setEditingId(null);
      setFilingId(null);
      onClose();
    });
  }, [noteId, onClose]);

  const check = async () => {
    if (!user || !note) return;
    try {
      await markNoteChecked(user.uid, note.id);
    } catch (error) {
      console.error('Helm note was not marked checked', error);
      addToast({ title: HELM_COPY.noteCheckFailed, type: 'error' });
    }
  };

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
      const { write, restore } = await deleteNote(
        user.uid,
        note.id,
        selectAllTopics(store.getState()),
        store.getState().helm.media.items,
      );
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
          : note.source === 'capture'
            ? HELM_COPY.noteFromWhatYouSaid(formatDateShort(note.createdAt))
            : note.isFromGeneralAnswer
              ? `${HELM_COPY.noteSavedFromAnswer} · ${formatDateShort(note.createdAt)}`
              : HELM_COPY.noteAdded(formatDateShort(note.createdAt)),
        ...(note.isFromGeneralAnswer
          ? [
              note.checkedAt === null
                ? HELM_COPY.noteNotChecked
                : HELM_COPY.noteCheckedByYou,
            ]
          : []),
        ...(note.lastEditedAt !== null
          ? [HELM_COPY.noteChangedOn(formatDateShort(note.lastEditedAt))]
          : []),
      ]
    : [];

  const ownPage = note
    ? filterPrivateOwnPage(note, (entry) => entry.privacy === 'private')
    : null;

  return (
    <>
      <DetailSheet
        isOpen={note !== null && !isEditing}
        onClose={onClose}
        title={title}
        footer={
          note &&
          !isFiling && (
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
                      text={[ownPage?.title, ownPage?.body]
                        .filter(Boolean)
                        .join('\n\n')}
                    />
                    <Button
                      type='button'
                      variant='secondary'
                      onClick={() => setEditingId(note.id)}
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
        {note && isFiling && (
          <NoteTopicsFields note={note} onClose={() => setFilingId(null)} />
        )}
        {note && !isFiling && (
          <div className='space-y-4'>
            {note.hasHealthCaution && (
              <p className='bg-muted text-foreground flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-[13px] leading-[18px] font-semibold text-pretty'>
                <Stethoscope
                  className='mt-px size-4 shrink-0'
                  aria-hidden='true'
                />
                <span className='min-w-0'>{HELM_COPY.answerHealthCaution}</span>
              </p>
            )}
            {note.body &&
              (note.source === 'importedFile' ? (
                <MarkdownText
                  text={withoutTitleHeading(note.body, note.title)}
                  className='text-[15px] break-words'
                />
              ) : (
                <LinkedText text={note.body} className='text-[15px]' />
              ))}
            <KeptMediaSection record={{ kind: 'note', id: note.id }} />
            <PrivateRow kind='note' record={note} title={note.title} />
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
              <p className='text-muted-foreground min-w-0 text-[13px]'>
                {origin.join(' · ')}
              </p>
              {note.isFromGeneralAnswer && note.checkedAt === null && (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  className='relative after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-[""]'
                  onClick={() => void check()}
                >
                  {HELM_COPY.noteIChecked}
                </Button>
              )}
            </div>
            {note.topicIds.length === 0 && (
              <div className='flex flex-wrap items-center gap-x-1.5'>
                <span className='text-muted-foreground text-[13px]'>
                  {HELM_COPY.noteInNoTopic}
                </span>
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  className='relative after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-[""]'
                  onClick={() => setFilingId(note.id)}
                >
                  {HELM_COPY.notePutInOne}
                </Button>
              </div>
            )}
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
        isOpen={isEditing}
        onClose={() => setEditingId(null)}
        onSaved={onClose}
        note={note}
      />
    </>
  );
}

export default NoteSheet;
