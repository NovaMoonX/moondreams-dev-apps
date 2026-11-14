import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppSelector } from '@/store';
import {
  OftenFields,
  TimesFields,
} from '@apps/helm/components/habits/HabitWhenFields';
import { HELM_COPY } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { updateHabitWhen } from '@apps/helm/store/actions/habitActions';
import type { OpenHabit } from '@apps/helm/types';
import {
  fromWhenDraft,
  readWhenBlocker,
  toWhenDraft,
  type WhenDraft,
} from '@apps/helm/utils/habitDraft';

interface HabitWhenSheetProps {
  isOpen: boolean;
  onClose: () => void;
  habit: OpenHabit;
}

interface HabitWhenFormProps extends Omit<HabitWhenSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

function HabitWhenForm({
  habit,
  onClose,
  requestClose,
  onDirtyChange,
}: HabitWhenFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const profile = useAppSelector((state) => state.helm.profile);
  const [draft, setDraft] = useState<WhenDraft>(() => toWhenDraft(habit));
  const [isSaving, setIsSaving] = useState(false);
  const blocker = readWhenBlocker(draft);

  const change = (next: WhenDraft) => {
    setDraft(next);
    onDirtyChange(true);
  };

  const save = async () => {
    if (!user || isSaving || blocker !== null) return;
    setIsSaving(true);
    try {
      const result = await updateHabitWhen(
        user.uid,
        await getHelmEncryption(user.uid),
        habit.id,
        fromWhenDraft(draft, habit, Date.now()),
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
      console.error('Helm habit times were not saved', error);
      addToast({ title: HELM_COPY.habitEditFailed, type: 'error' });
    }
    setIsSaving(false);
  };

  return (
    <div className='space-y-5'>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.habitWhenHint}
      </p>
      <OftenFields draft={draft} onChange={change} showsLabels />
      <TimesFields
        draft={draft}
        profile={{
          dayStartTime: profile?.dayStartTime ?? '08:00',
          dayEndTime: profile?.dayEndTime ?? '22:00',
        }}
        onChange={change}
        showsLabels
      />
      <ModalFooterActions
        note={blocker}
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
          <Button
            type='button'
            loading={isSaving}
            disabled={blocker !== null}
            onClick={() => void save()}
          >
            {HELM_COPY.habitWhenSave}
          </Button>
        }
      />
    </div>
  );
}

/** Change which days a habit asks for something and when in the day, on the person's own clock. */
function HabitWhenSheet({ isOpen, onClose, habit }: HabitWhenSheetProps) {
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
      title={HELM_COPY.habitWhenTitle}
    >
      {isOpen && (
        <HabitWhenForm
          habit={habit}
          onClose={close}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default HabitWhenSheet;
