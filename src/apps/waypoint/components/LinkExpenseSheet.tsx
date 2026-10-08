import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DetailSheet from '@/components/DetailSheet';
import SearchInput from '@/components/SearchInput';
import { getDayCount, getDayLabel } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { useAppDispatch, useAppSelector } from '@/store';
import { LIST_SEARCH_THRESHOLD } from '@apps/waypoint/constants';
import { linkExpenseToPlan } from '@apps/waypoint/store/actions/expenseActions';
import { setPlanNeedsNoExpense } from '@apps/waypoint/store/actions/tripActions';
import { selectTripExpenses } from '@apps/waypoint/store/selectors';
import type { TripExpense, TripSpace } from '@apps/waypoint/types';
import { getExpenseCategoryKey, getExpenseCategoryKeyLabel } from '@apps/waypoint/utils/expenseCategories';
import { getExpenseLinkKey, type RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface LinkExpenseSheetProps {
  trip: TripSpace;
  subject: RelatedSubject;
  currentUserId: string;
  onAddNew: () => void;
  onClose: () => void;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function formatAmount(expense: TripExpense) {
  const formatter =
    currencyFormatters.get(expense.currency) ??
    new Intl.NumberFormat(undefined, { style: 'currency', currency: expense.currency });
  currencyFormatters.set(expense.currency, formatter);
  return expense.amount !== null
    ? formatter.format(expense.amount)
    : `${formatter.format(expense.amountMin ?? 0)}–${formatter.format(expense.amountMax ?? 0)}`;
}

function LinkExpenseSheet({ trip, subject, currentUserId, onAddNew, onClose }: LinkExpenseSheetProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const expenses = useAppSelector(selectTripExpenses);
  const [query, setQuery] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const unlinked = expenses
    .filter((expense) => !expense.linkedTo)
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

  const markNoExpense = async () => {
    setLinkingId('none');
    try {
      await dispatch(
        setPlanNeedsNoExpense({ uid: currentUserId, trip, linkKey: getExpenseLinkKey(subject.link), needsNone: true }),
      ).unwrap();
      addToast({
        title: `No expense needed for ${subject.title}`,
        description: "You can undo it from the plan's details.",
        type: 'success',
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
            <span className='text-foreground font-medium'>Hides this reminder for everyone.</span> Undo it from the plan&apos;s details.
          </p>
        </div>
      }
    >
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          For <span className='text-foreground font-medium'>{subject.title}</span>.
          {unlinked.length > 0 && <> Pick one that&apos;s already on your list; we&apos;ll only fill in a missing day.</>}
        </p>
        {unlinked.length >= LIST_SEARCH_THRESHOLD && (
          <SearchInput value={query} onChange={setQuery} placeholder='Search expenses' />
        )}
        {unlinked.length === 0 ? (
          <p className='text-muted-foreground text-sm'>Every expense is already linked to a plan.</p>
        ) : visible.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No expense matches.</p>
        ) : (
          <ul className='divide-border max-h-80 divide-y overflow-y-auto'>
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
                  <span className='shrink-0 text-sm whitespace-nowrap'>{formatAmount(expense)}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DetailSheet>
  );
}

export default LinkExpenseSheet;
