import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import TopicPicker from '@apps/helm/components/knowledge/TopicPicker';
import { HELM_COPY } from '@apps/helm/constants';
import { fileNoteInTopics } from '@apps/helm/store/actions/noteActions';
import type { OpenNote } from '@apps/helm/types';

interface NoteTopicsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  note: OpenNote;
}

const refusalLine = (kind: 'missing' | 'tooMany' | 'offline') =>
  kind === 'offline'
    ? HELM_COPY.editNeedsConnection
    : kind === 'tooMany'
      ? HELM_COPY.noteTopicsFull
      : HELM_COPY.topicGone;

export function NoteTopicsFields({
  note,
  onClose,
}: Pick<NoteTopicsSheetProps, 'note' | 'onClose'>) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [topicIds, setTopicIds] = useState(note.topicIds);
  const [newTopicName, setNewTopicName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const isPending = newTopicName.trim() !== '';

  const save = async () => {
    if (!user || isBusy) return;
    setIsBusy(true);
    try {
      const result = await fileNoteInTopics(user.uid, note.id, topicIds);
      if (result === 'filed') {
        onClose();
        return;
      }
      addToast({ title: refusalLine(result), type: 'info' });
    } catch (error) {
      console.error('Helm note topics were not saved', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  return (
    <div className='space-y-4'>
      <TopicPicker
        values={topicIds}
        onChange={setTopicIds}
        pendingName={newTopicName}
        onPendingNameChange={setNewTopicName}
      />
      <ModalFooterActions
        note={isPending ? HELM_COPY.topicPickerPending : null}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={onClose}
            disabled={isBusy}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isBusy}
            disabled={isPending}
            onClick={() => void save()}
          >
            {HELM_COPY.editSave}
          </Button>
        }
      />
    </div>
  );
}

/** Where a note is filed: the topic picker for one note, written as a field-scoped change that leaves the note's edit and check marks alone. */
function NoteTopicsSheet({ isOpen, onClose, note }: NoteTopicsSheetProps) {
  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.noteChangeTopicTitle}
    >
      {isOpen && <NoteTopicsFields note={note} onClose={onClose} />}
    </FormSheet>
  );
}

export default NoteTopicsSheet;
