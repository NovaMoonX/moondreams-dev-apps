import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import DetailSheet from '@/components/DetailSheet';
import SearchInput from '@/components/SearchInput';
import { getDayCount, getDayLabel } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { useAppDispatch, useAppSelector } from '@/store';
import { LIST_SEARCH_THRESHOLD } from '@apps/waypoint/constants';
import { linkExpenseToPlan } from '@apps/waypoint/store/actions/expenseActions';
import { setPlanNeedsNoExpense } from '@apps/waypoint/store/actions/tripActions';
import { selectTimelineEvents, selectTripExpenses } from '@apps/waypoint/store/selectors';
import type { TripExpense, TripSpace } from '@apps/waypoint/types';
import { getExpenseCategoryKey, getExpenseCategoryKeyLabel } from '@apps/waypoint/utils/expenseCategories';
import { formatExpenseAmount } from '@apps/waypoint/utils/formatExpenseAmount';
import { getExpenseLinkKey, type RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface LinkExpenseSheetProps {
  trip: TripSpace;
  subject: RelatedSubject;
  currentUserId: string;
  onAddNew: () => void;
  onClose: () => void;
}

function LinkExpenseSheet({ trip, subject, currentUserId, onAddNew, onClose }: LinkExpenseSheetProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const expenses = useAppSelector(selectTripExpenses);
  const events = useAppSelector(selectTimelineEvents);
  const eventIds = useMemo(() => new Set(events.map((event) => event.id)), [events]);
  const [query, setQuery] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const unlinked = expenses
    .filter((expense) => !expense.linkedTo || (expense.linkedTo.kind === 'EVENT' && !eventIds.has(expense.linkedTo.id)))
    .sort((first, second) => Number(second.dayIndex === subject.dayIndex) - Number(first.dayIndex === subject.dayIndex));
  const term = query.trim().toLowerCase();
  const visible = term ? unlinked.filter((expense) => expense.title.toLowerCase().includes(term)) : unlinked;

  const link = async (expense: TripExpense) => {
    setLinkingId(expense.id);
    try {
      await dispatch(linkExpenseToPlan({ expense, link: subject.link, dayIndex: subject.dayIndex })).unwrap();
      addToast({ title: `Linked ${expense.title} to ${subject.title}`, type: 'success' });
      onClose();
    } catch (linkError) {
      addToast({
        title: 'Unable to link this expense',
        description: getErrorMessage(linkError, 'Please try again.'),
        type: 'error',
      });
      setLinkingId(null);
    }
  };

  const setNeedsNone = (needsNone: boolean) =>
    dispatch(
      setPlanNeedsNoExpense({ uid: currentUserId, trip, linkKey: getExpenseLinkKey(subject.link), needsNone }),
    ).unwrap();

  const markNoExpense = async () => {
    setLinkingId('none');
    try {
      await setNeedsNone(true);
      addToast({
        title: `No expense needed for ${subject.title}`,
        type: 'success',
        action: {
          label: 'Undo',
          onClick: () =>
            void setNeedsNone(false).catch((undoError) =>
              addToast({
                title: 'Unable to undo that',
                description: getErrorMessage(undoError, 'Please try again.'),
                type: 'error',
              }),
            ),
        },
      });
      onClose();
    } catch (markError) {
      addToast({
        title: 'Unable to save that',
        description: getErrorMessage(markError, 'Please try again.'),
        type: 'error',
      });
      setLinkingId(null);
    }
  };

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title='Link an expense'
      footer={
        <div className='flex flex-col gap-2'>
          <Button type='button' size='lg' disabled={linkingId !== null} onClick={onAddNew}>
            Add a new expense
          </Button>
          <Button type='button' variant='secondary' size='lg' className='border-border border' disabled={linkingId !== null} onClick={() => void markNoExpense()}>
            No expense needed
          </Button>
          <p className='text-muted-foreground text-center text-xs'>
            <span className='text-foreground font-medium'>Hides this reminder for everyone.</span> You can bring it back later.
          </p>
        </div>
      }
    >
      <div className={join('flex flex-col gap-3', unlinked.length >= LIST_SEARCH_THRESHOLD ? 'h-[max(12rem,calc(92dvh-22rem))]' : 'max-h-[max(12rem,calc(92dvh-22rem))]')}>
        <div className='shrink-0 space-y-3'>
          <p className='text-muted-foreground text-sm'>
            For <span className='text-foreground font-medium'>{subject.title}</span>.
            {unlinked.length > 0 && <> Pick one that&apos;s already on your list; we&apos;ll only fill in a missing day.</>}
          </p>
          {unlinked.length >= LIST_SEARCH_THRESHOLD && (
            <SearchInput value={query} onChange={setQuery} placeholder='Search expenses' />
          )}
        </div>
        <div className='min-h-0 flex-1 overflow-y-auto'>
        {unlinked.length === 0 ? (
          <p className='text-muted-foreground text-sm'>Every expense is already linked to an event, stay or rental.</p>
        ) : visible.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No expense matches.</p>
        ) : (
          <ul className='divide-border divide-y'>
            {visible.map((expense) => (
              <li key={expense.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  disabled={linkingId !== null}
                  className='h-auto min-h-12 w-full justify-between gap-3 rounded-none px-0! py-2 text-left font-normal'
                  onClick={() => void link(expense)}
                >
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm font-medium'>{expense.title}</span>
                    <span className='text-muted-foreground block text-xs'>
                      {getExpenseCategoryKeyLabel(getExpenseCategoryKey(expense))} ·{' '}
                      {expense.dayIndex === null ? 'No specific day' : getDayLabel(trip.startDate, expense.dayIndex, dayCount)}
                    </span>
                  </span>
                  <span className='shrink-0 text-sm whitespace-nowrap'>{formatExpenseAmount(expense)}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        </div>
      </div>
    </DetailSheet>
  );
}

export default LinkExpenseSheet;
