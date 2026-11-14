import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DateInput from '@/components/DateInput';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { HELM_COPY } from '@apps/helm/constants';

interface HabitPauseSheetProps {
  isOpen: boolean;
  name: string;
  /** The habit day today, so the day picked must come after it. */
  todayKey: string;
  onClose: () => void;
  onPause: (until: number) => void;
}

interface HabitPauseFormProps extends Omit<
  HabitPauseSheetProps,
  'isOpen' | 'name'
> {
  onClose: () => void;
}

function HabitPauseForm({ todayKey, onClose, onPause }: HabitPauseFormProps) {
  const [value, setValue] = useState('');
  const until = fromDateInputValue(value) ?? null;
  const isAfterToday =
    until !== null && until > Date.parse(`${todayKey}T00:00:00Z`);

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.habitPauseHint}
      </p>
      <div className='space-y-1.5'>
        <span className='block text-sm font-medium'>
          {HELM_COPY.habitPauseUntil}
        </span>
        <DateInput
          aria-label={HELM_COPY.habitPauseUntil}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <ModalFooterActions
        note={
          value !== '' && !isAfterToday ? HELM_COPY.habitPauseNeedsDay : null
        }
        cancelAction={
          <Button type='button' variant='tertiary' onClick={onClose}>
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            disabled={!isAfterToday}
            onClick={() => {
              if (until !== null && isAfterToday) onPause(until);
            }}
          >
            {HELM_COPY.habitPauseAction}
          </Button>
        }
      />
    </div>
  );
}

/** Pause a habit until a day the person picks: off Today until then, and the days between don't count. */
function HabitPauseSheet({
  isOpen,
  name,
  todayKey,
  onClose,
  onPause,
}: HabitPauseSheetProps) {
  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.habitPauseTitle(name)}
    >
      {isOpen && (
        <HabitPauseForm
          todayKey={todayKey}
          onClose={onClose}
          onPause={onPause}
        />
      )}
    </FormSheet>
  );
}

export default HabitPauseSheet;
