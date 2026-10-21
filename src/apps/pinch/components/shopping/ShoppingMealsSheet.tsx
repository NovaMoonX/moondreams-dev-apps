import { useRef, useState } from 'react';

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
  formatSourceSlot,
  getMealRows,
  getSourceNames,
  type HeldMeal,
  type ShoppingMeal,
  type StopEntry,
  type StopRowCounts,
} from '@apps/pinch/utils/shopping';

const UNDO_TOAST_MS = 6000;
const ROWS_SHOWN = 40;
const UNDO_GUARD_MS = 600;

const undone = new Set<string>();

interface HeldRow extends HeldMeal {
  stopId: string;
  entries: StopEntry[];
  note: string | undefined;
  takenAt: number;
}

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
  const [held, setHeld] = useState<ReadonlyMap<string, HeldRow>>(new Map());
  const inFlight = useRef(new Set<string>());
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
  const rows = getMealRows(meals, held);
  const hasSearch = rows.length >= LIST_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const found =
    needle === ''
      ? rows
      : rows.filter(({ meal }) =>
          [getTitle(meal), getWhat(meal)].some((text) =>
            text.toLowerCase().includes(needle),
          ),
        );
  const visible = found.length <= limit + 3 ? found : found.slice(0, limit);
  const names = new Map(
    getSourceNames(
      rows.map(({ meal }) => meal.source),
      new Map([
        ...rows.map(({ meal }) => [meal.source, meal.label] as const),
        ...labels,
      ]),
      todayKey,
    ).map(({ source, name }) => [source, name]),
  );
  const getName = (meal: ShoppingMeal) =>
    names.get(meal.source) ?? meal.label.name;

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
      return restored;
    } catch (undoError) {
      addToast({
        title: "Couldn't undo that",
        description: getErrorMessage(undoError, 'Your list is as it is now.'),
        type: 'error',
      });
      return null;
    }
  };

  const handleUndo = async (source: string, tappedAt: number) => {
    const entry = held.get(source);
    if (
      !entry ||
      entry.status !== 'taken' ||
      undone.has(entry.stopId) ||
      tappedAt - entry.takenAt < UNDO_GUARD_MS
    ) {
      return;
    }
    undone.add(entry.stopId);
    const restored = await undo(entry.entries);
    if (restored === null) {
      undone.delete(entry.stopId);
      return;
    }
    setHeld((current) => {
      const now = current.get(source);
      if (!now || now.stopId !== entry.stopId) return current;
      return new Map(current).set(
        source,
        restored === 0
          ? { ...now, entries: [] }
          : { ...now, status: 'restored' },
      );
    });
  };

  const handleStop = async (meal: ShoppingMeal) => {
    const name = getName(meal);
    if (inFlight.current.has(meal.source)) {
      return;
    }
    if (!navigator.onLine) {
      setError(
        `Removing a meal needs a connection, so ${name} is still on your list. Try again once you're back online.`,
      );
      return;
    }
    setError(null);
    inFlight.current.add(meal.source);
    const stopId = generateUuid();
    setHeld((current) =>
      new Map(current).set(meal.source, {
        meal,
        status: 'removing',
        stopId,
        entries: [],
        note: undefined,
        takenAt: 0,
      }),
    );
    try {
      const result: StopResult = await dispatch(
        stopShoppingFor({ uid, source: meal.source }),
      ).unwrap();
      setHeld((current) =>
        new Map(current).set(meal.source, {
          meal,
          status: 'taken',
          stopId,
          entries: result.entries,
          note: getStoppedText(result.rows, meal),
          takenAt: performance.now(),
        }),
      );
    } catch (stopError) {
      setHeld((current) => {
        const next = new Map(current);
        next.delete(meal.source);
        return next;
      });
      setError(
        `Couldn't take ${name} off your list. ${getErrorMessage(stopError, '')}`.trim(),
      );
    } finally {
      inFlight.current.delete(meal.source);
    }
  };

  const handleClose = () => {
    held.forEach((entry) => {
      if (
        entry.status !== 'taken' ||
        entry.entries.length === 0 ||
        undone.has(entry.stopId)
      ) {
        return;
      }
      const id = generateUuid();
      addToast({
        id,
        title: `Took ${getName(entry.meal)} off your list`,
        description: entry.note,
        type: 'success',
        duration: UNDO_TOAST_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            removeToast(id);
            if (undone.has(entry.stopId)) return;

            undone.add(entry.stopId);
            void undo(entry.entries);
          },
        },
      });
    });
    onClose();
  };

  const getFacts = ({ meal, held: entry }: (typeof rows)[number]): Fact[] =>
    entry?.status === 'taken'
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

  const getAction = ({ meal, held: entry }: (typeof rows)[number]) => {
    if (entry?.status === 'taken') {
      return entry.entries.length === 0
        ? null
        : {
            label: 'Undo',
            description: `Put ${getName(meal)} back on your list`,
            isBusy: false,
          };
    }
    return meal.openCount === 0
      ? null
      : {
          label: 'Remove',
          description: `Remove ${getName(meal)} from your list`,
          isBusy: entry?.status === 'removing',
        };
  };

  return (
    <DetailSheet
      isOpen
      onClose={handleClose}
      title='Meals on your list'
      footer={
        isPhone ? undefined : (
          <div className='flex justify-end'>
            <Button
              type='button'
              variant='secondary'
              data-modal-action='true'
              onClick={handleClose}
            >
              Done
            </Button>
          </div>
        )
      }
    >
      <div className='flex max-h-[max(12rem,calc(92dvh-12rem))] flex-col gap-3 sm:[@media(min-height:600px)]:max-h-[calc(100dvh-21rem)]'>
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
        {rows.length === 0 && (
          <p className='text-muted-foreground py-2 text-sm'>
            Your list isn't for any meal now.
          </p>
        )}
        {rows.length > 0 && found.length === 0 && (
          <p className='text-muted-foreground py-2 text-sm wrap-break-word'>
            No meal on your list matches “{query.trim()}”.
          </p>
        )}
        {found.length > 0 && (
          <ul className='divide-border min-h-0 flex-1 divide-y overflow-y-auto [@media(max-height:800px)]:min-h-36'>
            {visible.map((row) => {
              const { meal, held: entry } = row;
              const action = getAction(row);
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
                        entry?.status === 'taken' &&
                          'text-muted-foreground line-through',
                      )}
                    >
                      {getTitle(meal)}
                    </p>
                    <FactsLine
                      facts={getFacts(row)}
                      className='text-muted-foreground text-xs'
                    />
                    {entry?.status === 'taken' && entry.note && (
                      <p className='text-muted-foreground mt-0.5 text-xs wrap-break-word'>
                        {entry.note}
                      </p>
                    )}
                  </div>
                  {action && (
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      aria-label={action.description}
                      aria-busy={action.isBusy}
                      className="relative -mt-0.5 shrink-0 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
                      onClick={(event) =>
                        void (entry?.status === 'taken'
                          ? handleUndo(meal.source, event.timeStamp)
                          : handleStop(meal))
                      }
                    >
                      {action.label}
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
