import { useId, useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import EmojiField from '@/components/EmojiField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import HabitWhoField from '@apps/helm/components/habits/HabitWhoField';
import {
  HABIT_NAME_MAX,
  HABIT_NOTES_MAX,
  HELM_COPY,
  MEDICINE_DOSE_MAX,
  MEDICINE_NAME_MAX,
} from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { updateHabitWords } from '@apps/helm/store/actions/habitActions';
import type { OpenHabit } from '@apps/helm/types';

interface HabitEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  habit: OpenHabit;
}

interface HabitEditFormProps extends Omit<HabitEditSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const toFirstEmoji = (text: string) =>
  Array.from(new Intl.Segmenter().segment(text.trim()))[0]?.segment ?? '';

function HabitEditForm({
  habit,
  onClose,
  requestClose,
  onDirtyChange,
}: HabitEditFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const [name, setName] = useState(habit.name);
  const [emoji, setEmoji] = useState(habit.emoji ?? '');
  const [notes, setNotes] = useState(habit.notes ?? '');
  const [forWhoId, setForWhoId] = useState(habit.forWhoId);
  const [medicine, setMedicine] = useState(habit.medicine?.name ?? '');
  const [dose, setDose] = useState(habit.medicine?.dose ?? '');
  const [isTouched, setIsTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isMissing = name.trim() === '';

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      onDirtyChange(true);
    };

  const save = async () => {
    if (!user || isSaving) return;
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    setIsSaving(true);
    try {
      const result = await updateHabitWords(
        user.uid,
        await getHelmEncryption(user.uid),
        habit.id,
        {
          name,
          emoji: emoji || null,
          notes: notes.trim() || null,
          forWhoId: habit.isCare ? forWhoId : habit.forWhoId,
          medicine: habit.isCare
            ? { name: medicine, dose: dose.trim() || null }
            : undefined,
        },
      );
      if (result === 'saved') {
        onClose();
        return;
      }
      addToast({
        title:
          result === 'offline'
            ? HELM_COPY.habitEditNeedsConnection
            : result === 'missing'
              ? HELM_COPY.habitGone
              : HELM_COPY.habitUnreadable,
        type: 'info',
      });
    } catch (error) {
      console.error('Helm habit was not saved', error);
      addToast({ title: HELM_COPY.habitEditFailed, type: 'error' });
    }
    setIsSaving(false);
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-name`} className='text-sm font-medium'>
          {HELM_COPY.habitEditName}
        </label>
        <div className='flex items-start gap-3'>
          <EmojiField
            value={emoji}
            ariaLabel={HELM_COPY.habitEditEmoji}
            onChange={(value) => edit(setEmoji)(toFirstEmoji(value))}
          />
          <Input
            id={`${fieldId}-name`}
            className='min-w-0 flex-1'
            value={name}
            maxLength={HABIT_NAME_MAX}
            autoFocus={canFocusFieldOnOpen()}
            onChange={(event) => edit(setName)(event.target.value)}
          />
        </div>
      </div>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-notes`} className='text-sm font-medium'>
          {HELM_COPY.habitNotesField}
        </label>
        <Textarea
          id={`${fieldId}-notes`}
          value={notes}
          maxLength={HABIT_NOTES_MAX}
          rows={3}
          placeholder={HELM_COPY.habitNotesPlaceholder}
          onChange={(event) => edit(setNotes)(event.target.value)}
        />
      </div>
      {habit.isCare && (
        <div className='space-y-1.5'>
          <label
            htmlFor={`${fieldId}-medicine`}
            className='text-sm font-medium'
          >
            {HELM_COPY.habitMedicineField}
          </label>
          <div className='flex items-start gap-3'>
            <Input
              id={`${fieldId}-medicine`}
              className='min-w-0 flex-[2]'
              value={medicine}
              maxLength={MEDICINE_NAME_MAX}
              placeholder={HELM_COPY.habitMedicinePlaceholder}
              onChange={(event) => edit(setMedicine)(event.target.value)}
            />
            <Input
              className='min-w-0 flex-1'
              aria-label={HELM_COPY.habitDoseField}
              value={dose}
              maxLength={MEDICINE_DOSE_MAX}
              placeholder={HELM_COPY.habitDosePlaceholder}
              onChange={(event) => edit(setDose)(event.target.value)}
            />
          </div>
        </div>
      )}
      {habit.isCare && (
        <div className='space-y-1.5'>
          <span className='block text-sm font-medium'>
            {HELM_COPY.habitWhoQuestion}
          </span>
          <HabitWhoField value={forWhoId} onChange={edit(setForWhoId)} />
        </div>
      )}
      <ModalFooterActions
        note={isTouched && isMissing ? HELM_COPY.habitEditNameMissing : null}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSaving}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button type='button' loading={isSaving} onClick={() => void save()}>
            {HELM_COPY.habitEditSave}
          </Button>
        }
      />
    </div>
  );
}

/** Change a habit's name, emoji, notes and, for care, its medicine. */
function HabitEditSheet({ isOpen, onClose, habit }: HabitEditSheetProps) {
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
      title={HELM_COPY.habitEditTitle}
    >
      {isOpen && (
        <HabitEditForm
          habit={habit}
          onClose={close}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default HabitEditSheet;
