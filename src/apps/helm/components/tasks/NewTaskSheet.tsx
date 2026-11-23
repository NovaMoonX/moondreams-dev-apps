import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DateInput from '@/components/DateInput';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SayWhenField from '@/components/SayWhenField';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppSelector } from '@/store';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { HELM_COPY, TASK_TITLE_CAP } from '@apps/helm/constants';
import PrivateSwitchLine from '@apps/helm/components/privacy/PrivateSwitchLine';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { createTask } from '@apps/helm/store/actions/taskActions';
import { readOnceWords } from '@apps/helm/utils/sayWhen';

interface NewTaskSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The new task's id, so its own sheet can open on it. */
  onCreated: (taskId: string) => void;
}

interface NewTaskFormProps extends Omit<NewTaskSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

function NewTaskForm({
  onClose,
  onCreated,
  requestClose,
  onDirtyChange,
}: NewTaskFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const zone = useAppSelector((state) => state.helm.profile?.timeZone ?? 'UTC');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isMissing = title.trim() === '';

  const change = (nextTitle: string, nextDay: string) => {
    setTitle(nextTitle);
    setDay(nextDay);
    onDirtyChange(nextTitle !== '' || nextDay !== '');
  };

  const sayWhen = (text: string) => {
    const read = readOnceWords(text, { now: Date.now(), zone });
    if (!read?.schedule.startsOn) return null;
    change(title, read.schedule.startsOn);
    return { words: read.words, key: read.schedule.startsOn };
  };

  const add = async () => {
    if (!user || isSaving) return;
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    setIsSaving(true);
    try {
      const encryption = await getHelmEncryption(user.uid);
      const date = fromDateInputValue(day);
      const { id, write } = await createTask(user.uid, encryption, {
        title,
        due: date === undefined ? null : { kind: 'day', date },
        isPrivate,
      });
      write.catch((error: unknown) => {
        console.error('Helm task was not saved', error);
        addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
      });
      onClose();
      onCreated(id);
    } catch (error) {
      console.error('Helm task was not made', error);
      addToast({ title: HELM_COPY.wordsSaveFailed, type: 'error' });
      setIsSaving(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-title`} className='text-sm font-medium'>
          {HELM_COPY.taskTitleLabel}
        </label>
        <Input
          id={`${fieldId}-title`}
          value={title}
          maxLength={TASK_TITLE_CAP}
          autoFocus
          onChange={(event) => change(event.target.value, day)}
        />
      </div>
      <SayWhenField
        label={HELM_COPY.sayWhenLabel}
        placeholder={HELM_COPY.sayWhenDatePlaceholder}
        unreadLine={HELM_COPY.sayWhenUnread}
        onRead={sayWhen}
        currentKey={day}
      />
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-day`} className='text-sm font-medium'>
          {HELM_COPY.whenLabel}
        </label>
        <DateInput
          id={`${fieldId}-day`}
          placeholder={HELM_COPY.noDay}
          value={day}
          onChange={(event) => change(title, event.target.value)}
        />
      </div>
      <PrivateSwitchLine checked={isPrivate} onCheckedChange={setIsPrivate} />
      <ModalFooterActions
        note={isTouched && isMissing ? HELM_COPY.taskTitleMissing : null}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button type='button' onClick={() => void add()} loading={isSaving}>
            {HELM_COPY.addTask}
          </Button>
        }
      />
    </div>
  );
}

/** New task: the words and an optional day, made without the assistant. Add task opens the new task's own sheet. */
function NewTaskSheet({ isOpen, onClose, onCreated }: NewTaskSheetProps) {
  const [isDirty, setIsDirty] = useState(false);
  const requestClose = useDiscardGuard({
    isDirty,
    onClose: () => {
      setIsDirty(false);
      onClose();
    },
  });

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={HELM_COPY.taskFormTitle}
    >
      {isOpen && (
        <NewTaskForm
          onClose={() => {
            setIsDirty(false);
            onClose();
          }}
          onCreated={onCreated}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default NewTaskSheet;
