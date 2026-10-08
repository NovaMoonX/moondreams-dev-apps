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
import { selectTripExpenses } from '@apps/waypoint/store/selectors';
import type { TripExpense, TripSpace } from '@apps/waypoint/types';
import { getExpenseCategoryKey, getExpenseCategoryKeyLabel } from '@apps/waypoint/utils/expenseCategories';
import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface LinkExpenseSheetProps {
  trip: TripSpace;
  subject: RelatedSubject;
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

function LinkExpenseSheet({ trip, subject, onAddNew, onClose }: LinkExpenseSheetProps) {
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

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={subject.title}
      footer={
        <div className='flex flex-col gap-2'>
          <Button type='button' size='lg' onClick={onAddNew}>
            Add a new expense
          </Button>
        </div>
      }
    >
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          Already on the list? Pick the expense that goes with this. Nothing it already has changes, and a missing day is
          filled in.
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
