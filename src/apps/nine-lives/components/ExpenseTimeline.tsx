import { useMemo, useState } from 'react';

import { Input, Select, Toggle } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { Cat, Expense } from '../types';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  getExpenseCategories,
  getExpenseCategoryLabel,
} from '../utils/budgetCalculators';

function getExpenseTitle(expense: Expense): string {
  if (expense.label) {
    return expense.label;
  }

  const categories = getExpenseCategories(expense);

  if (categories.length === 1) {
    return getExpenseCategoryLabel(categories[0]);
  }

  return `${categories.length} categories`;
}

interface ExpenseTimelineProps {
  expenses: Expense[];
  cats?: Cat[];
  emptyLabel?: string;
  onEdit?: (expense: Expense) => void;
}

type CadenceFilter = 'all' | 'one_time' | 'monthly' | 'yearly';
type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const CADENCE_FILTER_OPTIONS: { text: string; value: CadenceFilter }[] = [
  { text: 'All cadences', value: 'all' },
  { text: 'One-time', value: 'one_time' },
  { text: 'Monthly', value: 'monthly' },
  { text: 'Yearly', value: 'yearly' },
];

const SORT_OPTIONS: { text: string; value: SortOption }[] = [
  { text: 'Date: newest first', value: 'date_desc' },
  { text: 'Date: oldest first', value: 'date_asc' },
  { text: 'Amount: high to low', value: 'amount_desc' },
  { text: 'Amount: low to high', value: 'amount_asc' },
];

const SORT_FIELD_BY_OPTION: Record<SortOption, 'incurredAt' | 'amount'> = {
  date_desc: 'incurredAt',
  date_asc: 'incurredAt',
  amount_desc: 'amount',
  amount_asc: 'amount',
};

const SORT_DIRECTION_BY_OPTION: Record<SortOption, 'asc' | 'desc'> = {
  date_desc: 'desc',
  date_asc: 'asc',
  amount_desc: 'desc',
  amount_asc: 'asc',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function ExpenseTimeline({
  expenses,
  cats = [],
  emptyLabel = 'No expenses logged yet.',
  onEdit,
}: ExpenseTimelineProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [cadenceFilter, setCadenceFilter] = useState<CadenceFilter>('all');
  const [showStopped, setShowStopped] = useState(true);
  const [sortOption, setSortOption] = useState<SortOption>('date_desc');

  const hasStoppedExpenses = useMemo(
    () => expenses.some((expense) => expense.isRecurring && expense.recurrenceEndedAt != null),
    [expenses],
  );

  const catFilterOptions = useMemo(
    () => [
      { text: 'All cats', value: 'all' },
      ...cats.map((cat) => ({ text: cat.name, value: cat.id })),
    ],
    [cats],
  );

  const categoryFilterOptions = useMemo(
    () => [
      { text: 'All categories', value: 'all' },
      ...DEFAULT_EXPENSE_CATEGORIES.map((category) => ({
        text: getExpenseCategoryLabel(category),
        value: category,
      })),
    ],
    [],
  );

  const visibleExpenses = useMemo(() => {
    const searchTerm = searchQuery.trim().toLowerCase();

    const filtered = expenses.filter((expense) => {
      if (catFilter !== 'all' && !expense.catIds.includes(catFilter)) {
        return false;
      }

      if (categoryFilter !== 'all' && !getExpenseCategories(expense).includes(categoryFilter as Expense['items'][number]['category'])) {
        return false;
      }

      if (!showStopped && expense.isRecurring && expense.recurrenceEndedAt != null) {
        return false;
      }

      if (cadenceFilter !== 'all') {
        const expenseCadence = expense.isRecurring
          ? (expense.recurrenceInterval ?? 'monthly')
          : 'one_time';

        if (expenseCadence !== cadenceFilter) {
          return false;
        }
      }

      if (!searchTerm) {
        return true;
      }

      const catNames = expense.catIds
        .map((catId) => cats.find((cat) => cat.id === catId)?.name ?? '')
        .join(' ');
      const searchableText = [
        ...getExpenseCategories(expense).map(getExpenseCategoryLabel),
        expense.label ?? '',
        expense.items.map((item) => item.label ?? '').join(' '),
        catNames,
        expense.notes ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });

    const sortField = SORT_FIELD_BY_OPTION[sortOption];
    const sortDirection = SORT_DIRECTION_BY_OPTION[sortOption];

    return [...filtered].sort((left, right) =>
      sortDirection === 'desc'
        ? right[sortField] - left[sortField]
        : left[sortField] - right[sortField],
    );
  }, [expenses, cats, searchQuery, catFilter, categoryFilter, cadenceFilter, showStopped, sortOption]);

  const hasExpenses = expenses.length > 0;
  const visibleTotal = visibleExpenses.reduce((total, expense) => total + expense.amount, 0);

  return (
    <div>
      {hasExpenses && (
        <div className='mt-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2'>
          <div className='min-w-40 flex-1'>
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder='Search expenses'
              variant='outline'
            />
          </div>

          <div className='flex gap-2'>
            <span className='text-muted-foreground shrink-0 text-sm pt-1'>Filter by:</span>
            <div className='flex flex-wrap items-center gap-2'>
              {cats.length > 1 && (
                <div className='max-w-36 flex-1'>
                  <Select
                    options={catFilterOptions}
                    value={catFilter}
                    onChange={setCatFilter}
                    size='sm'
                  />
                </div>
              )}
              <div className='max-w-40 flex-1'>
                <Select
                  options={categoryFilterOptions}
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  size='sm'
                />
              </div>
              <div className='max-w-36 flex-1'>
                <Select
                  options={CADENCE_FILTER_OPTIONS}
                  value={cadenceFilter}
                  onChange={(value) => setCadenceFilter(value as CadenceFilter)}
                  size='sm'
                />
              </div>
              {hasStoppedExpenses && cadenceFilter !== 'one_time' && (
                <label className='flex items-center gap-2 text-sm'>
                  <Toggle size='sm' checked={showStopped} onCheckedChange={setShowStopped} />
                  Show stopped
                </label>
              )}
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground text-sm'>Sort by:</span>
            <div className='max-w-48 flex-1'>
              <Select
                options={SORT_OPTIONS}
                value={sortOption}
                onChange={(value) => setSortOption(value as SortOption)}
                size='sm'
              />
            </div>
          </div>
        </div>
      )}

      {hasExpenses && visibleExpenses.length > 0 && (
        <div className='border-border flex items-center justify-between border-b py-2'>
          <span className='text-muted-foreground text-xs font-medium uppercase tracking-wide'>
            Total
          </span>
          <span className='text-sm font-semibold'>{currencyFormatter.format(visibleTotal)}</span>
        </div>
      )}

      {visibleExpenses.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {hasExpenses ? 'No expenses match your search or filters.' : emptyLabel}
        </p>
      ) : (
        <div className={join('divide-border divide-y', hasExpenses && 'mt-0')}>
          {visibleExpenses.map((expense) => {
            const catNames = expense.catIds
              .map((catId) => cats.find((cat) => cat.id === catId)?.name)
              .filter(Boolean)
              .join(', ');

            return (
              <button
                key={expense.id}
                type='button'
                onClick={() => onEdit?.(expense)}
                className={join(
                  'flex w-full items-start justify-between gap-3 py-3 text-left first:pt-0',
                  onEdit ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                <div className='min-w-0'>
                  <strong className='text-sm'>{getExpenseTitle(expense)}</strong>
                  <div className='text-muted-foreground text-sm'>
                    {new Date(expense.incurredAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {catNames ? ` · ${catNames}` : ''}
                    {expense.isRecurring
                      ? ` · ${expense.recurrenceInterval ?? 'monthly'}${
                          expense.recurrenceEndedAt != null ? ' (stopped)' : ''
                        }`
                      : ''}
                  </div>
                </div>
                <div className='shrink-0 font-semibold'>
                  {currencyFormatter.format(expense.amount)}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ExpenseTimeline;
