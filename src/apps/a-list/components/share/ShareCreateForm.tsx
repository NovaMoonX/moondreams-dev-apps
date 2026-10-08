import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DateRangeField, { type DateRangeValue } from '@/components/forms/DateRangeField';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import {
  MAX_SHARE_RANGE_DAYS,
  SHARE_RANGE_OPTIONS,
} from '@apps/a-list/constants';
import type { ShareRangeKind } from '@apps/a-list/types';
import {
  formatShareRange,
  getQuickShareRange,
  getRangeDayCount,
  pickSharedViewings,
  type DayKeyRange,
} from '@apps/a-list/utils/sharing';

const PIN_OPTIONS = [
  { value: 'OPEN', label: 'No, anyone with the link', emoji: '🔓' },
  { value: 'PIN', label: 'Yes, add a PIN', emoji: '🔒' },
] as const;

interface ShareCreateFormProps {
  /** Resolves true once the link exists; the form stays as typed when it fails. */
  onCreate: (range: DayKeyRange, hasPin: boolean) => Promise<boolean>;
  onCancel: () => void;
  isDisabled: boolean;
}

function ShareCreateForm({
  onCreate,
  onCancel,
  isDisabled,
}: ShareCreateFormProps) {
  const now = useNow();
  const viewings = useAppSelector((state) => state.aList.viewings.items);
  const [kind, setKind] = useState<ShareRangeKind>('THIS_MONTH');
  const [hasPin, setHasPin] = useState(false);
  const [custom, setCustom] = useState<DateRangeValue>(() => {
    const month = getQuickShareRange('THIS_MONTH', now);
    return { startDate: month?.startKey ?? '', endDate: month?.endKey ?? '' };
  });

  const range: DayKeyRange =
    getQuickShareRange(kind, now) ??
    { startKey: custom.startDate, endKey: custom.endDate };
  const { startKey, endKey } = range;
  const dayCount = getRangeDayCount(range);
  const movieCount = useMemo(
    () =>
      dayCount > 0 ? pickSharedViewings(viewings, { startKey, endKey }).length : 0,
    [viewings, startKey, endKey, dayCount],
  );

  const getSummary = () => {
    if (dayCount < 1) {
      return {
        isReady: false,
        text: 'Pick a start day that comes before the end day.',
      };
    }
    if (dayCount > MAX_SHARE_RANGE_DAYS) {
      return { isReady: false, text: 'A link can cover up to a year.' };
    }
    if (movieCount === 0) {
      return {
        isReady: false,
        text: '🍿 Nothing is planned in these dates yet. Add a movie to the calendar, then come back.',
      };
    }

    const start = fromDateInputValue(startKey) ?? 0;
    const end = fromDateInputValue(endKey) ?? 0;
    return {
      isReady: true,
      text: `🎬 ${movieCount === 1 ? '1 movie' : `${movieCount} movies`} from ${formatShareRange(start, end)}`,
    };
  };
  const { isReady, text } = getSummary();

  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <p className='font-medium'>🗓️ What do you want to share?</p>
        <PillGroup
          label='Dates to share'
          options={SHARE_RANGE_OPTIONS}
          value={kind}
          onChange={setKind}
        />
        {kind === 'CUSTOM' && (
          <DateRangeField
            value={custom}
            onChange={setCustom}
            disabled={isDisabled}
          />
        )}
        <p
          className={isReady ? 'text-sm font-medium' : 'text-muted-foreground text-sm'}
          aria-live='polite'
        >
          {text}
        </p>
      </div>

      <div className='space-y-3'>
        <p className='font-medium'>🔐 Lock it with a PIN?</p>
        <PillGroup
          label='PIN'
          options={PIN_OPTIONS}
          value={hasPin ? 'PIN' : 'OPEN'}
          onChange={(value) => setHasPin(value === 'PIN')}
        />
        <p className='text-muted-foreground text-sm'>
          {hasPin
            ? "We'll make a 4-character PIN for you to send along with the link. You can turn it on or off later."
            : 'Anyone you send the link to can open it.'}
        </p>
      </div>

      <p className='bg-muted/50 text-muted-foreground rounded-2xl p-3 text-sm'>
        <strong className='text-foreground'>A snapshot, not a live view.</strong>{' '}
        It shows each movie, poster, time, format and theater, and never your
        name, prices or ratings. Movies you add or change later won&apos;t show
        up.
      </p>

      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            rounded='full'
            disabled={isDisabled}
            onClick={onCancel}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            rounded='full'
            disabled={!isReady || isDisabled}
            onClick={() => void onCreate(range, hasPin)}
          >
            Create link
          </Button>
        }
      />
    </div>
  );
}

export default ShareCreateForm;
