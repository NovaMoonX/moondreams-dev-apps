import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import DetailSheet from '@/components/DetailSheet';
import FactsLine, { type Fact } from '@/components/FactsLine';
import SearchInput from '@/components/SearchInput';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { LIST_SEARCH_THRESHOLD, MEAL_TYPE_EMOJIS } from '@apps/pinch/constants';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  stopShoppingFor,
  undoStopShopping,
  type StopResult,
} from '@apps/pinch/store/actions/shoppingActions';
import {
  selectShoppingMeals,
  selectShoppingSourceLabels,
} from '@apps/pinch/store/selectors';
import {
  compareSourceLabels,
  formatSourceSlot,
  getSourceNames,
  type ShoppingMeal,
  type StopEntry,
  type StopRowCounts,
} from '@apps/pinch/utils/shopping';

const UNDO_TOAST_MS = 6000;
const ROWS_SHOWN = 40;

const undone = new Set<string>();

const KIND_WORDS = { recipe: 'Recipe', meal: 'Saved meal' } as const;

const getEmoji = ({ label }: ShoppingMeal) => {
  if (label.kind === 'planned') {
    return label.mealType ? MEAL_TYPE_EMOJIS[label.mealType] : '🍽️';
  }
  return label.kind === 'recipe' ? '🍲' : '🍽️';
};

const getProgress = ({ openCount, rowCount }: ShoppingMeal) => {
  if (openCount === 0) return 'Got everything';
  return openCount === rowCount
    ? `${openCount} to buy`
    : `${openCount} of ${rowCount} to buy`;
};

const getStoppedText = (
  { removed, reduced, kept, left }: StopRowCounts,
  meal: ShoppingMeal,
) => {
  const things = (count: number) =>
    count === 1 ? '1 thing' : `${count} things`;
  const stay = (count: number) => (count === 1 ? 'stays' : 'stay');
  const clauses = [
    removed > 0 && `${things(removed)} came off your list`,
    reduced > 0 &&
      `${things(reduced)} went down by this ${meal.label.kind === 'recipe' ? 'recipe' : 'meal'}'s share`,
    kept > 0 &&
      `${things(kept)} ${stay(kept)}, since something else on your list still needs ${kept === 1 ? 'it' : 'them'}`,
    left > 0 &&
      `${things(left)} ${stay(left)} as ${left === 1 ? 'it was' : 'they were'}`,
  ].filter((clause) => clause !== false);
  return clauses.length === 0 ? undefined : `${clauses.join('; ')}.`;
};

interface ShoppingMealsSheetProps {
  uid: string;
  todayKey: string;
  onClose: () => void;
}

function ShoppingMealsSheet({
  uid,
  todayKey,
  onClose,
}: ShoppingMealsSheetProps) {
  const dispatch = useAppDispatch();
  const { addToast, removeToast } = useToast();
  const isPhone = useMediaQuery().isBelow('sm');
  const meals = useAppSelector((state) => selectShoppingMeals(state, todayKey));
  const labels = useAppSelector(selectShoppingSourceLabels);
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
  const [taken, setTaken] = useState<ReadonlyMap<string, ShoppingMeal>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(ROWS_SHOWN);

  const getTitle = (meal: ShoppingMeal) =>
    meal.label.kind === 'planned'
      ? formatSourceSlot(meal.label, todayKey)
      : meal.label.name;
  const getWhat = (meal: ShoppingMeal) =>
    meal.label.kind === 'planned'
      ? meal.label.name
      : KIND_WORDS[meal.label.kind];
  const liveSources = new Set(meals.map((meal) => meal.source));
  const takenMeals = [...taken.values()].filter(
    (meal) => !liveSources.has(meal.source),
  );
  const takenSources = new Set(takenMeals.map((meal) => meal.source));
  const shown = [...meals, ...takenMeals].sort(compareSourceLabels);
  const hasSearch = shown.length >= LIST_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const found =
    needle === ''
      ? shown
      : shown.filter((meal) =>
          [getTitle(meal), getWhat(meal)].some((text) =>
            text.toLowerCase().includes(needle),
          ),
        );
  const visible = found.length <= limit + 3 ? found : found.slice(0, limit);
  const names = new Map(
    getSourceNames(
      shown.map((meal) => meal.source),
      new Map([
        ...shown.map((meal) => [meal.source, meal.label] as const),
        ...labels,
      ]),
      todayKey,
    ).map(({ source, name }) => [source, name]),
  );

  const undo = async (entries: StopEntry[]) => {
    try {
      const restored = await dispatch(
        undoStopShopping({ uid, entries }),
      ).unwrap();
      if (restored < entries.length) {
        addToast({
          title:
            restored === 0
              ? 'Nothing was put back'
              : `Put back ${restored} of ${entries.length}`,
          description: 'What changed on your list since keeps what it has.',
          type: 'info',
        });
      }
    } catch (undoError) {
      addToast({
        title: "Couldn't undo that",
        description: getErrorMessage(undoError, 'Your list is as it is now.'),
        type: 'error',
      });
    }
  };

  const handleStop = async (meal: ShoppingMeal) => {
    const name = names.get(meal.source) ?? meal.label.name;
    if (stopping.has(meal.source)) {
      return;
    }
    if (!navigator.onLine) {
      setError(
        `Removing a meal needs a connection, so ${name} is still on your list. Try again once you're back online.`,
      );
      return;
    }
    setError(null);
    setStopping((current) => new Set(current).add(meal.source));
    try {
      const result: StopResult = await dispatch(
        stopShoppingFor({ uid, source: meal.source }),
      ).unwrap();
      setTaken((current) => new Map(current).set(meal.source, meal));
      const id = generateUuid();
      addToast({
        id,
        title: `Took ${name} off your list`,
        description: getStoppedText(result.rows, meal),
        type: 'success',
        duration: UNDO_TOAST_MS,
        action:
          result.entries.length > 0
            ? {
                label: 'Undo',
                onClick: () => {
                  removeToast(id);
                  if (undone.has(id)) return;

                  undone.add(id);
                  void undo(result.entries);
                },
              }
            : undefined,
      });
    } catch (stopError) {
      setError(
        `Couldn't take ${name} off your list. ${getErrorMessage(stopError, '')}`.trim(),
      );
    } finally {
      setStopping((current) => {
        const next = new Set(current);
        next.delete(meal.source);
        return next;
      });
    }
  };

  const getFacts = (meal: ShoppingMeal): Fact[] =>
    takenSources.has(meal.source)
      ? [{ key: 'taken', content: 'Taken off your list' }]
      : [
          ...(meal.isPast ? [{ key: 'past', content: 'Passed' }] : []),
          {
            key: 'what',
            content: (
              <span className='wrap-break-word whitespace-normal'>
                {getWhat(meal)}
              </span>
            ),
          },
          { key: 'progress', content: getProgress(meal) },
        ];

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title='Meals on your list'
      footer={
        isPhone ? undefined : (
          <div className='flex justify-end'>
            <Button
              type='button'
              variant='secondary'
              data-modal-action='true'
              onClick={onClose}
            >
              Done
            </Button>
          </div>
        )
      }
    >
      <div className='flex max-h-[max(12rem,calc(92dvh-12rem))] flex-col gap-3 sm:max-h-[calc(100dvh-21rem)]'>
        <div className='shrink-0 space-y-2'>
          <p className='text-muted-foreground text-sm'>
            Remove a meal and what it added comes off your list. What you've
            ticked stays.
          </p>
          {error && (
            <p className='text-destructive text-sm' role='alert'>
              {error}
            </p>
          )}
          {hasSearch && (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder='Search these meals'
            />
          )}
        </div>
        {shown.length === 0 && (
          <p className='text-muted-foreground py-2 text-sm'>
            Your list isn't for any meal now.
          </p>
        )}
        {shown.length > 0 && found.length === 0 && (
          <p className='text-muted-foreground py-2 text-sm wrap-break-word'>
            No meal on your list matches “{query.trim()}”.
          </p>
        )}
        {found.length > 0 && (
          <ul className='divide-border min-h-0 flex-1 divide-y overflow-y-auto [@media(max-height:800px)]:min-h-36'>
            {visible.map((meal) => {
              const isStopping = stopping.has(meal.source);
              const isTaken = takenSources.has(meal.source);
              return (
                <li
                  key={meal.source}
                  className='flex min-h-14 items-start gap-3 py-2.5'
                >
                  <span
                    className='flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--pinch-drizzle-soft)]'
                    aria-hidden='true'
                  >
                    {getEmoji(meal)}
                  </span>
                  <div className='min-w-0 flex-1'>
                    <p
                      className={join(
                        'font-medium wrap-break-word',
                        isTaken && 'text-muted-foreground line-through',
                      )}
                    >
                      {getTitle(meal)}
                    </p>
                    <FactsLine
                      facts={getFacts(meal)}
                      className='text-muted-foreground text-xs'
                    />
                  </div>
                  {meal.openCount > 0 && !isTaken && (
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      aria-label={`Remove ${names.get(meal.source) ?? meal.label.name} from your list`}
                      loading={isStopping}
                      disabled={isStopping}
                      className="relative -mt-0.5 shrink-0 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
                      onClick={() => void handleStop(meal)}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              );
            })}
            {visible.length < found.length && (
              <li>
                <ShowMoreButton onClick={() => setLimit(limit + ROWS_SHOWN)}>
                  Show {Math.min(found.length - visible.length, ROWS_SHOWN)}{' '}
                  more
                </ShowMoreButton>
              </li>
            )}
          </ul>
        )}
      </div>
    </DetailSheet>
  );
}

export default ShoppingMealsSheet;
