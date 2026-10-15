import { useMemo, useState } from 'react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { RefreshCw } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import HelpTip from '@/components/HelpTip';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  hasCompleteCostData,
  repriceDay,
} from '@apps/pinch/store/actions/freezeActions';
import {
  selectCostContext,
  selectPlannedByDay,
} from '@apps/pinch/store/selectors';
import { MAX_REPRICE_MEALS } from '@apps/pinch/constants';
import type { PlannedMeal } from '@apps/pinch/types';
import {
  formatDayShort,
  getDateOfDayKey,
  getLocalTodayDate,
} from '@apps/pinch/utils/dayKeys';
import { getRepriceLines } from '@apps/pinch/utils/mealFormat';
import {
  getRepricedAt,
  getRepricePreview,
  wouldRepriceChange,
} from '@apps/pinch/utils/mealMath';

const NO_MEALS: PlannedMeal[] = [];

interface RepriceDayRowProps {
  uid: string;
  dayKey: string;
}

/** Shown only for a passed day that today's prices would change, so it is never a button that does nothing. */
function RepriceDayRow({ uid, dayKey }: RepriceDayRowProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const meals = useAppSelector(selectPlannedByDay).get(dayKey) ?? NO_MEALS;
  const costContext = useAppSelector(selectCostContext);
  const hasCompleteData = useAppSelector(hasCompleteCostData);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPassed = getDateOfDayKey(dayKey) < getLocalTodayDate();
  const canReprice = useMemo(
    () =>
      hasPassed &&
      hasCompleteData &&
      meals.length <= MAX_REPRICE_MEALS &&
      meals.some((meal) => wouldRepriceChange(meal, costContext)),
    [hasPassed, hasCompleteData, meals, costContext],
  );

  if (!canReprice && error === null) {
    return null;
  }

  const handleReprice = async () => {
    setError(null);
    setIsBusy(true);
    try {
      const dayName = formatDayShort(dayKey);
      const lines = getRepriceLines(
        getRepricePreview(meals, costContext),
        meals.some(
          (meal) => meal.snapshot && getRepricedAt(meal.snapshot) !== null,
        ),
      );
      const confirmed = await confirm({
        title: `Use today's prices for ${dayName}?`,
        message: (
          <div className='space-y-3 text-left'>
            <dl className='space-y-1'>
              <div className='flex items-baseline justify-between gap-4'>
                <dt className='text-muted-foreground'>Before</dt>
                <dd className='font-medium whitespace-nowrap'>
                  {lines.before}
                </dd>
              </div>
              <div className='flex items-baseline justify-between gap-4'>
                <dt className='text-muted-foreground'>After</dt>
                <dd className='font-medium whitespace-nowrap'>{lines.after}</dd>
              </div>
            </dl>
            {lines.leftOut && <p>{lines.leftOut}.</p>}
            <p>
              This redoes {dayName}'s cost and nutrition from today's prices and
              recipes. You can't undo it. Your meals stay on the day.
            </p>
          </div>
        ),
        confirmText: "Use today's prices",
        cancelText: 'Cancel',
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      const changed = await dispatch(repriceDay({ uid, dayKey })).unwrap();
      addToast(
        changed === 0
          ? { title: `${dayName} already uses today's prices`, type: 'info' }
          : { title: `${dayName} now uses today's prices`, type: 'success' },
      );
    } catch (repriceError) {
      setError(
        getErrorMessage(
          repriceError,
          "Unable to use today's prices for this day.",
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className='space-y-1.5'>
      {canReprice && (
        <ActionRow
          icon={<RefreshCw className='h-4 w-4' />}
          label="Price this day with today's prices"
          subtitle="Redoes this day's cost and nutrition from today"
          isDisabled={isBusy}
          onClick={() => void handleReprice()}
          trailing={
            <HelpTip title="Today's prices" placement='top'>
              <p>
                A day is fixed when it passes, so adding a price later doesn't
                change it.
              </p>
              <p>
                This redoes the day with the prices and recipes you have now, so
                calories can change too.
              </p>
            </HelpTip>
          }
        />
      )}
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

export default RepriceDayRow;
