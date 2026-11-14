import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { PillGroup, type PillOption } from '@/components/PillGroup';
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
  /** Null pauses until the person resumes it. */
  onPause: (until: number | null) => void;
}

interface HabitPauseFormProps extends Omit<
  HabitPauseSheetProps,
  'isOpen' | 'name'
> {
  onClose: () => void;
}

type QuickPick = 'week' | 'twoWeeks' | 'open';

const QUICK_PICKS: readonly PillOption<QuickPick>[] = [
  { value: 'week', label: HELM_COPY.habitPauseWeek },
  { value: 'twoWeeks', label: HELM_COPY.habitPauseTwoWeeks },
  { value: 'open', label: HELM_COPY.habitPauseOpen },
];

const QUICK_DAYS = { week: 7, twoWeeks: 14 } as const;

function HabitPauseForm({ todayKey, onClose, onPause }: HabitPauseFormProps) {
  const [value, setValue] = useState('');
  const [quick, setQuick] = useState<QuickPick>('week');
  const [isCustom, setIsCustom] = useState(false);
  const today = Date.parse(`${todayKey}T00:00:00Z`);
  const picked = fromDateInputValue(value) ?? null;
  const isAfterToday = picked !== null && picked > today;
  const until = isCustom
    ? picked
    : quick === 'open'
      ? null
      : today + QUICK_DAYS[quick] * 86_400_000;
  const canPause = !isCustom || isAfterToday;

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.habitPauseHint}
      </p>
      <span className='block text-sm font-medium'>
        {HELM_COPY.habitPauseQuickLabel}
      </span>
      <PillGroup
        label={HELM_COPY.habitPauseQuickLabel}
        options={QUICK_PICKS}
        value={isCustom ? null : quick}
        onChange={(next) => {
          setQuick(next);
          setIsCustom(false);
          setValue('');
        }}
      />
      <div className='space-y-1.5'>
        <span className='block text-sm font-medium'>
          {HELM_COPY.habitPauseUntil}
        </span>
        <DateInput
          aria-label={HELM_COPY.habitPauseUntil}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setIsCustom(event.target.value !== '');
          }}
        />
      </div>
      <ModalFooterActions
        note={isCustom && !isAfterToday ? HELM_COPY.habitPauseNeedsDay : null}
        cancelAction={
          <Button type='button' variant='tertiary' onClick={onClose}>
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            disabled={!canPause}
            onClick={() => {
              if (canPause) onPause(until);
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
