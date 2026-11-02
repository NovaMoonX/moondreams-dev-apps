import { useState } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import DetailSheet from '@/components/DetailSheet';
import { useAppSelector } from '@/store';
import { formatExpenseAmount } from '@apps/waypoint/utils/formatExpenseAmount';
import { selectExpensesByLinkKey } from '@apps/waypoint/store/selectors';
import type { TripExpense } from '@apps/waypoint/types';
import {
  getExpenseCategoryKey,
  getExpenseCategoryKeyLabel,
} from '@apps/waypoint/utils/expenseCategories';
import {
  getExpenseLinkKey,
  type RelatedSubject,
} from '@apps/waypoint/utils/relatedSubjects';

interface LinkedExpensesBadgeProps {
  getSubject: () => RelatedSubject;
  /** A plain badge, for inside a details drawer, which can't have another sheet opened over it. */
  isStatic?: boolean;
  /** Hangs off the bottom-right corner of a card, outside it, like a tab. */
  variant?: 'inline' | 'tab';
}

const NO_EXPENSES: TripExpense[] = [];

/** How many expenses are linked to an event; opens them. */
function LinkedExpensesBadge({
  getSubject,
  isStatic = false,
  variant = 'inline',
}: LinkedExpensesBadgeProps) {
  const tabClassName =
    'bg-card border-border -mt-px rounded-t-none rounded-b-lg border border-t-0 px-3 py-1';
  const subject = getSubject();
  const key = getExpenseLinkKey(subject.link);
  const expenses = useAppSelector(
    (state) => selectExpensesByLinkKey(state).get(key) ?? NO_EXPENSES,
  );
  const [isOpen, setIsOpen] = useState(false);

  if (expenses.length === 0) {
    return null;
  }

  const label = `💸 ${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'}`;

  if (isStatic) {
    return (
      <Badge variant='muted' outline className='whitespace-nowrap'>
        {label}
      </Badge>
    );
  }

  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        data-paid-tab={variant === 'tab' ? '' : undefined}
        aria-label={`${label}. See them`}
        className={join(
          "text-muted-foreground relative h-auto text-xs font-medium whitespace-nowrap after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
          variant === 'tab'
            ? tabClassName
            : 'border-border rounded-full border px-2.5 py-0.5',
        )}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(true);
        }}
      >
        {label}
      </Button>
      <DetailSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Expenses for ${subject.title}`}
      >
        <ul className='divide-border divide-y'>
          {expenses.map((expense) => (
            <li
              key={expense.id}
              className='flex items-center justify-between gap-3 py-3'
            >
              <span className='min-w-0'>
                <span className='block truncate text-sm font-medium'>
                  {expense.title}
                </span>
                <span className='text-muted-foreground block text-xs'>
                  {getExpenseCategoryKeyLabel(getExpenseCategoryKey(expense))}
                </span>
              </span>
              <span className='shrink-0 text-sm whitespace-nowrap'>
                {formatExpenseAmount(expense)}
              </span>
            </li>
          ))}
        </ul>
      </DetailSheet>
    </>
  );
}

export default LinkedExpensesBadge;
