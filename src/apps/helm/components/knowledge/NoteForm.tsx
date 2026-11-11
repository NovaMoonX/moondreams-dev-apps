import { useId, useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppSelector } from '@/store';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import TopicPicker from '@apps/helm/components/knowledge/TopicPicker';
import {
  HELM_COPY,
  NOTE_BODY_MAX,
  NOTE_COUNT_FROM,
  NOTE_TITLE_MAX,
} from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  createNote,
  editNote,
  type NoteEdit,
  type NoteRefusal,
} from '@apps/helm/store/actions/noteActions';
import { selectTopicById } from '@apps/helm/store/selectors/knowledgeSelectors';
import type { OpenNote } from '@apps/helm/types';

interface NoteFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The note being changed; null starts a new one. */
  note: OpenNote | null;
  /** The topics a new note starts in. */
  initialTopicIds?: string[];
  /** Runs after a save has closed the form, for a host that was open beneath it. */
  onSaved?: () => void;
}

interface NoteFormProps extends Omit<NoteFormSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const refusalLine = (kind: NoteRefusal | Exclude<NoteEdit['kind'], 'saved'>) =>
  kind === 'offline'
    ? HELM_COPY.editNeedsConnection
    : kind === 'full'
      ? HELM_COPY.notesFull
      : kind === 'tooManyTopics'
        ? HELM_COPY.noteTopicsFull
        : kind === 'missing'
          ? HELM_COPY.noteGone
          : kind === 'unreadable'
            ? HELM_COPY.noteUnreadable
            : HELM_COPY.noteNeedsWords;

function NoteFormFields({
  note,
  initialTopicIds = [],
  onClose,
  onSaved,
  requestClose,
  onDirtyChange,
}: NoteFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const topicById = useAppSelector(selectTopicById);
  const noteCount = useAppSelector((state) => state.helm.notes.items.length);
  const [start] = useState(() => ({
    title: note?.title ?? '',
    body: note?.body ?? '',
    topicIds: (note?.topicIds ?? initialTopicIds).filter((id) =>
      topicById.has(id),
    ),
  }));
  const [title, setTitle] = useState(start.title);
  const [body, setBody] = useState(start.body);
  const [topicIds, setTopicIds] = useState(start.topicIds);
  const [newTopicName, setNewTopicName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const isEmpty = title.trim() === '' && body.trim() === '';
  const isTouched = title !== start.title || body !== start.body;
  const isPending = newTopicName.trim() !== '';

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      onDirtyChange(true);
    };

  const reportFailure = (error: unknown) => {
    console.error('Helm note was not saved', error);
    addToast({ title: HELM_COPY.editFailed, type: 'error' });
  };

  const undoToast = (
    toastTitle: string,
    undo: () => Promise<unknown>,
    isUndone: (result: unknown) => boolean = () => true,
  ) =>
    addToast({
      title: toastTitle,
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () =>
          void undo()
            .then((result) => {
              if (!isUndone(result)) {
                addToast({ title: HELM_COPY.undoChangedSince, type: 'info' });
              }
            })
            .catch((error: unknown) => {
              console.error('Helm note was not put back', error);
              addToast({ title: HELM_COPY.noteUndoFailed, type: 'error' });
            }),
      },
    });

  const save = async () => {
    if (!user || isBusy || isEmpty || isPending) return;
    setIsBusy(true);
    const words = { title, body, topicIds };
    try {
      const encryption = await getHelmEncryption(user.uid);
      const label = title.trim() || HELM_COPY.noteUntitled;
      if (note) {
        const result = await editNote(
          user.uid,
          encryption,
          note.id,
          start,
          words,
        );
        if (result.kind === 'saved') {
          undoToast(
            HELM_COPY.noteSavedToast(label),
            result.undo,
            (undone) => undone === true,
          );
          onClose();
          onSaved?.();
          return;
        }
        addToast({ title: refusalLine(result.kind), type: 'info' });
      } else {
        const result = await createNote(user.uid, encryption, words, noteCount);
        if (result.kind === 'made') {
          result.written.catch(reportFailure);
          undoToast(
            HELM_COPY.noteMadeToast(label),
            result.undo,
            (undone) => undone === true,
          );
          onClose();
          return;
        }
        addToast({ title: refusalLine(result.kind), type: 'info' });
      }
    } catch (error) {
      reportFailure(error);
    }
    setIsBusy(false);
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-title`} className='text-sm font-medium'>
          {HELM_COPY.noteTitleField}
        </label>
        <Input
          id={`${fieldId}-title`}
          value={title}
          maxLength={NOTE_TITLE_MAX}
          placeholder={HELM_COPY.noteTitlePlaceholder}
          autoFocus={canFocusFieldOnOpen()}
          onChange={(event) => edit(setTitle)(event.target.value)}
        />
      </div>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-body`} className='text-sm font-medium'>
          {HELM_COPY.noteBodyField}
        </label>
        <Textarea
          id={`${fieldId}-body`}
          variant='outline'
          rows={6}
          autoExpand
          value={body}
          maxLength={NOTE_BODY_MAX}
          placeholder={HELM_COPY.noteBodyPlaceholder}
          onChange={(event) => edit(setBody)(event.target.value)}
        />
        {body.length >= NOTE_COUNT_FROM && (
          <p className='text-muted-foreground text-right text-xs tabular-nums'>
            {HELM_COPY.noteCount(body.length)}
          </p>
        )}
      </div>
      <div className='space-y-1.5'>
        <p className='text-sm font-medium'>{HELM_COPY.noteTopicsField}</p>
        <p className='text-muted-foreground text-[13px]'>
          {HELM_COPY.noteTopicsHint}
        </p>
        <TopicPicker
          values={topicIds}
          onChange={edit(setTopicIds)}
          pendingName={newTopicName}
          onPendingNameChange={edit(setNewTopicName)}
        />
      </div>
      <ModalFooterActions
        note={
          isPending
            ? HELM_COPY.topicPickerPending
            : isEmpty && isTouched
              ? HELM_COPY.noteNeedsWords
              : null
        }
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isBusy}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isBusy}
            disabled={isEmpty || isPending}
            onClick={() => void save()}
          >
            {HELM_COPY.editSave}
          </Button>
        }
      />
    </div>
  );
}

/** Write a note or change one: a title, up to 20,000 characters (the count shows from 18,000) and the topics it is filed under. */
function NoteForm({
  isOpen,
  onClose,
  note,
  initialTopicIds,
  onSaved,
}: NoteFormSheetProps) {
  const [isDirty, setIsDirty] = useState(false);
  const close = () => {
    setIsDirty(false);
    onClose();
  };
  const requestClose = useDiscardGuard({ isDirty, onClose: close });

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={note ? HELM_COPY.noteEditTitle : HELM_COPY.noteAddTitle}
    >
      {isOpen && (
        <NoteFormFields
          note={note}
          initialTopicIds={initialTopicIds}
          onClose={close}
          onSaved={onSaved}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default NoteForm;
