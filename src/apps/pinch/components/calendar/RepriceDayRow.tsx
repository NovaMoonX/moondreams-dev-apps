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
import type { PlannedMeal } from '@apps/pinch/types';
import {
  formatDayShort,
  getDateOfDayKey,
  getLocalTodayDate,
} from '@apps/pinch/utils/dayKeys';
import { wouldRepriceChange } from '@apps/pinch/utils/mealMath';

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
      const confirmed = await confirm({
        title: `Use today's prices for ${dayName}?`,
        message: `This replaces the prices ${dayName} was fixed with, and you can't undo it. Your meals stay as they are.`,
        confirmText: "Use today's prices",
        cancelText: 'Cancel',
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      await dispatch(repriceDay({ uid, dayKey })).unwrap();
      addToast({
        title: `${dayName} now uses today's prices`,
        type: 'success',
      });
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
          subtitle='Replaces the prices this day was fixed with'
          isDisabled={isBusy}
          onClick={() => void handleReprice()}
          trailing={
            <HelpTip title="Today's prices" placement='top'>
              <p>
                A day is fixed with the prices it had when it passed, so adding
                a price later doesn't change it.
              </p>
              <p>This redoes the day with the prices you have now.</p>
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
