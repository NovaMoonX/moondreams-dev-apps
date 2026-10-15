import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { X } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/store';
import { dismissNudge } from '@apps/pinch/store/actions/settingsActions';
import {
  selectDismissedNudges,
  selectIngredientsById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import { NUTRITION_CELLS } from '@apps/pinch/constants';
import type { Gap } from '@apps/pinch/types';
import {
  countLeftOutIngredients,
  getGapKey,
  withoutDismissed,
} from '@apps/pinch/utils/gaps';

interface GapNudgeProps {
  uid: string;
  /** Every gap behind the number on screen; the ones the person closed are filtered out here. */
  gaps: Gap[];
  /** Words before the line, for a place where nothing is priced yet ("See what it costs:"). */
  lead?: string;
  onFillIn: (gaps: Gap[]) => void;
}

function GapNudge({ uid, gaps, lead, onFillIn }: GapNudgeProps) {
  const dispatch = useAppDispatch();
  const dismissed = useAppSelector(selectDismissedNudges);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [hasFailed, setHasFailed] = useState(false);
  const show = useAppSelector(selectShowNutrition);
  const open = withoutDismissed(gaps, dismissed);

  if (open.length === 0) {
    return null;
  }

  const count = countLeftOutIngredients(open);
  const needsPrice = open.some((gap) => gap.kind === 'NO_PRODUCT');
  const needsSize = open.some((gap) => gap.kind === 'NOT_COMPARABLE');
  const needsNutrition = open.some((gap) => gap.kind === 'NO_NUTRITION');
  const metricsOn = NUTRITION_CELLS.filter((cell) => show[cell.key]);
  const nutritionWhat =
    metricsOn.length === 1
      ? metricsOn[0].label.toLowerCase()
      : 'nutrition values';
  const name =
    ingredientsById.get(open[0].ingredientId)?.name ?? 'An ingredient';

  const getWording = () => {
    if (needsNutrition && (needsPrice || needsSize)) {
      return {
        text:
          count === 1
            ? `${name} needs details`
            : `${count} ingredients need details`,
        action: 'Add details',
      };
    }
    if (needsNutrition) {
      return {
        text:
          count === 1
            ? `${name} has no ${nutritionWhat}`
            : `${count} ingredients have no ${nutritionWhat}`,
        action: 'Add values',
      };
    }
    if (needsPrice && needsSize) {
      return {
        text: `${count} ingredients need a price or a size`,
        action: 'Add details',
      };
    }
    if (needsSize) {
      return {
        text:
          count === 1
            ? `${name} can't be compared with its package size`
            : `${count} ingredients can't be compared with their package size`,
        action: 'Add a size',
      };
    }
    return {
      text:
        count === 1
          ? `${name} needs a price`
          : `${count} ingredients need a price`,
      action: count === 1 ? 'Add a price' : 'Add prices',
    };
  };
  const { text, action } = getWording();

  const handleDismiss = async () => {
    setHasFailed(false);
    try {
      await dispatch(dismissNudge({ uid, keys: open.map(getGapKey) })).unwrap();
    } catch {
      setHasFailed(true);
    }
  };

  return (
    <div className='flex items-start gap-1'>
      <p className='text-muted-foreground min-w-0 flex-1 py-2.5 text-sm'>
        {hasFailed ? "Couldn't hide this just now. " : null}
        {lead ? `${lead} ` : null}
        {text}{' '}
        <span className='whitespace-nowrap'>
          <span className='max-[360px]:hidden'>· </span>
          <Button
            type='button'
            variant='link'
            onClick={() => onFillIn(open)}
            className='relative h-auto p-0 align-baseline text-sm leading-[inherit] font-medium after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[""]'
          >
            {action}
          </Button>
        </span>
      </p>
      <Button
        type='button'
        variant='tertiary'
        aria-label='Hide this note'
        onClick={() => void handleDismiss()}
        className='h-10 w-10 shrink-0 p-0'
      >
        <X className='h-5 w-5 shrink-0' aria-hidden='true' />
      </Button>
    </div>
  );
}

export default GapNudge;
