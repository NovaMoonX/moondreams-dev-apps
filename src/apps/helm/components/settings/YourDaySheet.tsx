import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { setDayWindow } from '@apps/helm/store/actions/settingsActions';

interface YourDaySheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface YourDayFormProps {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSaved: () => void;
}

function YourDayForm({
  requestClose,
  onDirtyChange,
  onSaved,
}: YourDayFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const profile = useAppSelector((state) => state.helm.profile);
  const [start, setStart] = useState(profile?.dayStartTime ?? '');
  const [end, setEnd] = useState(profile?.dayEndTime ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const isOrdered = start !== '' && end !== '' && end > start;

  const change = (nextStart: string, nextEnd: string) => {
    setStart(nextStart);
    setEnd(nextEnd);
    onDirtyChange(
      nextStart !== profile?.dayStartTime || nextEnd !== profile?.dayEndTime,
    );
  };

  const save = async () => {
    if (!user || !isOrdered || isSaving) return;
    setIsSaving(true);
    try {
      await setDayWindow(user.uid, start, end);
      onSaved();
    } catch (error) {
      console.error('Helm day window was not saved', error);
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
      setIsSaving(false);
    }
  };

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.yourDayHint}
      </p>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-start`} className='text-sm font-medium'>
          {HELM_COPY.yourDayStart}
        </label>
        <Input
          id={`${fieldId}-start`}
          type='time'
          variant='outline'
          className='helm-field'
          value={start}
          onChange={(event) => change(event.target.value, end)}
        />
      </div>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-end`} className='text-sm font-medium'>
          {HELM_COPY.yourDayEnd}
        </label>
        <Input
          id={`${fieldId}-end`}
          type='time'
          variant='outline'
          className='helm-field'
          value={end}
          onChange={(event) => change(start, event.target.value)}
        />
      </div>
      <ModalFooterActions
        note={
          !isOrdered && start !== '' && end !== ''
            ? HELM_COPY.yourDayEndError
            : null
        }
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSaving}
          >
            {HELM_COPY.talkCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            onClick={() => void save()}
            loading={isSaving}
            disabled={!isOrdered}
          >
            {HELM_COPY.yourDaySave}
          </Button>
        }
      />
    </div>
  );
}

/** Your day: the hours suggestions stay inside. */
function YourDaySheet({ isOpen, onClose }: YourDaySheetProps) {
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
      title={HELM_COPY.yourDayRow}
    >
      {isOpen && (
        <YourDayForm
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
          onSaved={close}
        />
      )}
    </FormSheet>
  );
}

export default YourDaySheet;
