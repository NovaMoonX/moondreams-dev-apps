import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
  CONTAINER_PLACES,
} from '@apps/pinch/constants';
import { useContainerActions } from '@apps/pinch/hooks/useContainerActions';
import {
  selectContainers,
  selectMealsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Container, ContainerPlace, PlannedMeal } from '@apps/pinch/types';
import {
  getContainerTitle,
  getEatByPhrase,
  getEatByState,
  getServingsToEat,
} from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

/** The containers a planned meal can be eaten from: those of its recipes, and of the saved meal it came from. */
const useMealContainers = (meal: PlannedMeal) => {
  const containers = useAppSelector(selectContainers);
  return useMemo(
    () =>
      containers.filter(
        (container) =>
          (container.recipeId !== null &&
            meal.items.some(
              (item) =>
                item.kind === 'RECIPE' && item.refId === container.recipeId,
            )) ||
          (container.mealId !== null && container.mealId === meal.sourceMealId),
      ),
    [containers, meal],
  );
};

interface EatFromStockRowsProps {
  meal: PlannedMeal;
  onOpen: (place: ContainerPlace) => void;
}

/** One quiet row per place that holds something this meal could be eaten from; render inside an `ActionGroup`. */
export function EatFromStockRows({ meal, onOpen }: EatFromStockRowsProps) {
  const candidates = useMealContainers(meal);

  return (
    <>
      {CONTAINER_PLACES.map((place) => {
        const here = candidates.filter(
          (container) => container.place === place,
        );
        if (here.length === 0) return null;

        const label = `Eat from your ${CONTAINER_PLACE_LABELS[place].toLowerCase()}`;
        return (
          <ActionRow
            key={place}
            isGrouped
            icon={
              <span className='text-base leading-none'>
                {CONTAINER_PLACE_EMOJIS[place]}
              </span>
            }
            label={label}
            subtitle={`${here.length} ${here.length === 1 ? 'container matches' : 'containers match'} this meal`}
            onClick={() => onOpen(place)}
          />
        );
      })}
    </>
  );
}

interface EatFromStockViewProps {
  uid: string;
  meal: PlannedMeal;
  place: ContainerPlace;
  onBack: () => void;
}

/** Records what was eaten against a container, and nothing else: the plan, its prices and its cooks stay as they are. */
export function EatFromStockView({
  uid,
  meal,
  place,
  onBack,
}: EatFromStockViewProps) {
  const { eat } = useContainerActions(uid);
  const recipesById = useAppSelector(selectRecipesById);
  const mealsById = useAppSelector(selectMealsById);
  const rows = useMealContainers(meal).filter(
    (container) => container.place === place,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleEat = async (container: Container, count: number) => {
    setError(null);
    setBusyId(container.id);
    try {
      await eat(container, count);
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
          Takes the servings off a container. Your plan stays as it is.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className='text-muted-foreground py-2 text-center text-sm'>
          Nothing left in the {CONTAINER_PLACE_LABELS[place].toLowerCase()} for
          this meal.
        </p>
      ) : (
        <ul className='divide-border divide-y'>
          {rows.map((container) => {
            const count = getServingsToEat(container, meal);
            return (
              <li
                key={container.id}
                className='flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between'
              >
                <span className='min-w-0'>
                  <span className='block wrap-break-word'>
                    {getContainerTitle(container, recipesById, mealsById)}
                  </span>
                  <span className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
                    <span className='whitespace-nowrap'>
                      {formatServings(container.servings)} left
                    </span>
                    <span className='whitespace-nowrap'>
                      Eat by {getEatByPhrase(container.eatBy)}
                    </span>
                    <EatByBadge state={getEatByState(container.eatBy)} />
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
