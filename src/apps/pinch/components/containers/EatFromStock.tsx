import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from 'lucide-react';

import { useBackStep } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShort } from '@/utils/formatUtils';
import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import { CONTAINER_PLACE_LABELS } from '@apps/pinch/constants';
import { useContainerActions } from '@apps/pinch/hooks/useContainerActions';
import {
  selectMealsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Container, ContainerPlace, PlannedMeal } from '@apps/pinch/types';
import {
  getContainerTitle,
  getEatByLabel,
  getEatByState,
  getLastPlaceEvent,
  getServingsToEat,
} from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

interface EatFromStockViewProps {
  uid: string;
  meal: PlannedMeal;
  place: ContainerPlace;
  /** The containers the meal may eat from, already narrowed to its day and what it hasn't cooked. */
  containers: Container[];
  onBack: () => void;
}

export function EatFromStockView({
  uid,
  meal,
  place,
  containers,
  onBack,
}: EatFromStockViewProps) {
  const { eat } = useContainerActions(uid);
  const recipesById = useAppSelector(selectRecipesById);
  const mealsById = useAppSelector(selectMealsById);
  const rows = containers
    .filter((container) => container.place === place)
    .map((container) => ({
      container,
      title: getContainerTitle(container, recipesById, mealsById),
    }));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useBackStep(true, onBack);

  const handleEat = async (container: Container, count: number) => {
    if (busyId !== null) return;

    setError(null);
    setBusyId(container.id);
    try {
      if ((await eat(container, count)) !== undefined) onBack();
    } catch (eatError) {
      setError(getErrorMessage(eatError, 'Unable to save this.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className='space-y-5'>
      <Button
        type='button'
        variant='tertiary'
        className='h-10 gap-1 px-0!'
        onClick={onBack}
      >
        <ChevronLeft className='h-4 w-4' aria-hidden='true' />
        Back
      </Button>
      <div className='space-y-1'>
        <p className='font-medium'>
          Eat from your {CONTAINER_PLACE_LABELS[place].toLowerCase()}
        </p>
        <p className='text-muted-foreground text-sm'>
          Takes the servings off its box. Your plan stays as it is.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className='text-muted-foreground py-2 text-center text-sm'>
          Nothing left in the {CONTAINER_PLACE_LABELS[place].toLowerCase()} for
          this meal.
        </p>
      ) : (
        <ul className='divide-border divide-y'>
          {rows.map(({ container, title }) => {
            const count = getServingsToEat(container, meal);
            const state = getEatByState(container.eatBy);
            const tag = [
              getLastPlaceEvent(container.history)?.kind === 'THAW' && 'Thawed',
              rows.some(
                (other) =>
                  other.title === title && other.container !== container,
              ) && `Made ${formatDateShort(container.createdAt)}`,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li
                key={container.id}
                className='flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between'
              >
                <span className='min-w-0'>
                  <span className='block wrap-break-word'>{title}</span>
                  <span className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
                    <span className='whitespace-nowrap'>
                      {formatServings(container.servings)} left
                    </span>
                    {state === 'LATER' ? (
                      <span className='whitespace-nowrap'>
                        {getEatByLabel(container.eatBy)}
                      </span>
                    ) : (
                      <EatByBadge
                        state={state}
                        label={getEatByLabel(container.eatBy)}
                      />
                    )}
                    {tag && <span className='whitespace-nowrap'>{tag}</span>}
                  </span>
                </span>
                <Button
                  type='button'
                  variant='secondary'
                  className='h-10 shrink-0'
                  loading={busyId === container.id}
                  disabled={busyId !== null}
                  onClick={() => void handleEat(container, count)}
                >
                  {`Ate ${count}`}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}
