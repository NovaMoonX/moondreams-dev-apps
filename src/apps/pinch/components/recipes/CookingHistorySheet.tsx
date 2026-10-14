import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import CookEditView from '@apps/pinch/components/recipes/CookEditView';
import {
  COOK_HISTORY_FIRST_PAGE,
  COOK_HISTORY_PAGE_SIZE,
  SOFT_MAX_COOKS_PER_RECIPE,
} from '@apps/pinch/constants';
import {
  selectCooksByRecipe,
  selectPlannedMeals,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Cook } from '@apps/pinch/types';
import { getCookServings, isCookHistoryFull } from '@apps/pinch/utils/cooks';
import { formatDayTitle, getPlannedDayKey } from '@apps/pinch/utils/dayKeys';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

const NO_COOKS: Cook[] = [];
const HIDDEN_WORTH_A_BUTTON = 3;

type HistoryView = { kind: 'list' } | { kind: 'edit'; cookId: string | null };

interface CookingHistorySheetProps {
  uid: string;
  recipeId: string;
  onClose: () => void;
}

function CookingHistorySheet({
  uid,
  recipeId,
  onClose,
}: CookingHistorySheetProps) {
  const recipe = useAppSelector(selectRecipesById).get(recipeId);
  const cooks = useAppSelector(selectCooksByRecipe).get(recipeId) ?? NO_COOKS;
  const isLoaded = useAppSelector((state) => state.pinch.cooks.isLoaded);
  const loadError = useAppSelector((state) => state.pinch.cooks.loadError);
  const plannedMeals = useAppSelector(selectPlannedMeals);
  const [view, setView] = useState<HistoryView>({ kind: 'list' });
  const [limit, setLimit] = useState(COOK_HISTORY_FIRST_PAGE);

  const plannedById = useMemo(
    () => new Map(plannedMeals.map((planned) => [planned.id, planned])),
    [plannedMeals],
  );
  const getPlanNote = (cook: Cook) => {
    if (cook.plannedMealId == null) return null;
    const planned = plannedById.get(cook.plannedMealId);
    return planned
      ? `From your plan for ${formatDayTitle(getPlannedDayKey(planned.date))}`
      : 'From your plan';
  };

  const editedCook =
    view.kind === 'edit' && view.cookId !== null
      ? cooks.find((cook) => cook.id === view.cookId)
      : undefined;
  const isEditing =
    view.kind === 'edit' && (view.cookId === null || editedCook !== undefined);
  const isFull = isCookHistoryFull(cooks.length);
  const backToList = () => setView({ kind: 'list' });

  const hidden = cooks.length - limit;
  const visibleCount = hidden > HIDDEN_WORTH_A_BUTTON ? limit : cooks.length;
  const isCollapsible =
    visibleCount === cooks.length &&
    cooks.length > COOK_HISTORY_FIRST_PAGE + HIDDEN_WORTH_A_BUTTON;

  const getBody = () => {
    if (isEditing) {
      return (
        <CookEditView
          key={editedCook?.id ?? 'new'}
          uid={uid}
          recipeId={recipeId}
          recipeTitle={recipe?.title ?? 'This recipe'}
          cook={editedCook ?? null}
          defaultServings={getCookServings(recipe?.servings ?? 1)}
          planNote={editedCook ? getPlanNote(editedCook) : null}
          onBack={backToList}
        />
      );
    }
    if (loadError !== null) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Your cooking history couldn't load just now.
        </p>
      );
    }
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Loading your cooking history…
        </p>
      );
    }

    return (
      <div className='flex max-h-[max(12rem,calc(92dvh-14rem))] flex-col'>
        <div className='shrink-0 space-y-1 pb-1'>
          <p className='font-medium wrap-break-word'>
            {recipe?.title ?? 'This recipe'}
          </p>
          {isFull ? (
            <p className='text-muted-foreground text-sm'>
              A recipe's history holds up to {SOFT_MAX_COOKS_PER_RECIPE} cooks.
              Delete an older one to add more.
            </p>
          ) : (
            <Button
              type='button'
              variant='tertiary'
              className='h-10 justify-start px-0!'
              onClick={() => setView({ kind: 'edit', cookId: null })}
            >
              + Add an earlier cook
            </Button>
          )}
        </div>
        {cooks.length === 0 ? (
          <p className='text-muted-foreground py-4 text-center text-sm'>
            No cooks yet. Add the ones you remember.
          </p>
        ) : (
          <ul className='divide-border min-h-0 flex-1 divide-y overflow-y-auto'>
            {cooks.slice(0, visibleCount).map((cook) => {
              const planNote = getPlanNote(cook);
              return (
                <li key={cook.id}>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-label={`Change the cook from ${formatDateShort(cook.cookedAt)}`}
                    className='h-auto min-h-12 w-full items-start justify-start gap-3 px-0! py-2.5 text-left'
                    onClick={() => setView({ kind: 'edit', cookId: cook.id })}
                  >
                    <span className='min-w-0 flex-1'>
                      <span className='text-foreground block font-medium'>
                        <span className='whitespace-nowrap'>
                          {formatDateShort(cook.cookedAt)}
                        </span>
                        {' · '}
                        <span className='whitespace-nowrap'>
                          {formatServings(cook.servings)}
                        </span>
                      </span>
                      {planNote && (
                        <span className='text-muted-foreground block text-xs font-normal wrap-break-word'>
                          {planNote}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                </li>
              );
            })}
            {(hidden > HIDDEN_WORTH_A_BUTTON || isCollapsible) && (
              <li>
                <Button
                  type='button'
                  variant='tertiary'
                  className='h-10 justify-start px-0!'
                  onClick={() =>
                    setLimit(
                      isCollapsible
                        ? COOK_HISTORY_FIRST_PAGE
                        : limit + COOK_HISTORY_PAGE_SIZE,
                    )
                  }
                >
                  {isCollapsible
                    ? 'Show fewer'
                    : `Show ${Math.min(COOK_HISTORY_PAGE_SIZE, hidden)} more`}
                </Button>
              </li>
            )}
          </ul>
        )}
      </div>
    );
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Cooking history'>
      {getBody()}
    </FormSheet>
  );
}

export default CookingHistorySheet;
