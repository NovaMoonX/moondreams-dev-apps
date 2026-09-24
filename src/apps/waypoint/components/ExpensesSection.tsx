import { useMemo, useState } from 'react';

import { Badge, Button, Input, Tabs } from '@moondreamsdev/dreamer-ui/components';

import AppToggle from '@/components/AppToggle';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getDayCount, getDayLabel } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from '@apps/waypoint/constants';
import type { ExpenseSubmitValues } from '@apps/waypoint/components/ExpenseFormModal';
import ExpenseFormModal from '@apps/waypoint/components/ExpenseFormModal';
import ExpenseSplitModal, {
  type ExpenseSplitSubmitValues,
} from '@apps/waypoint/components/ExpenseSplitModal';
import MarkExpensePaidModal from '@apps/waypoint/components/MarkExpensePaidModal';
import {
  createExpense,
  deleteExpense,
  markExpensePaid,
  updateExpense,
  updateExpenseSplit,
} from '@apps/waypoint/store/actions/expenseActions';
import {
  computeExpenseTotals,
  selectTripExpenses,
  type TripExpenseTotals,
} from '@apps/waypoint/store/selectors';
import type { ExpenseCategory, ExpenseStatus, TripExpense, TripSpace } from '@apps/waypoint/types';
import {
  computeDuesSummary,
  getResolvedExpenseAmount,
  getSplitMemberIds,
} from '@apps/waypoint/utils/splitCalculators';

interface ExpensesSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

type SortBy = 'day' | 'amount';

function isCustomSplit(expense: TripExpense): boolean {
  return expense.targetType !== 'EVERYONE_CURRENT' || expense.splitAmounts !== null;
}

function getExpenseCategoryLabel(expense: TripExpense): string {
  return expense.category === 'OTHER' && expense.customCategoryLabel
    ? expense.customCategoryLabel
    : EXPENSE_CATEGORY_LABELS[expense.category];
}

function getSortAmount(expense: TripExpense): number {
  return (
    getResolvedExpenseAmount(expense) ?? expense.amountMax ?? expense.amountMin ?? 0
  );
}

function getSplitTargetLabel(
  expense: TripExpense,
  memberLabel: (uid: string) => string,
): string {
  switch (expense.targetType) {
    case 'EVERYONE_CURRENT':
      return 'Everyone';
    case 'EVERYONE_INCLUDING_FUTURE':
      return 'Everyone, including future members';
    case 'JUST_ME':
      return expense.payerUid ? `Just ${memberLabel(expense.payerUid)}` : 'Just the payer';
    case 'SPECIFIC_MEMBERS':
      return expense.targetMemberIds.map(memberLabel).join(', ');
  }
}

function describeSplit(
  expense: TripExpense,
  memberIds: string[],
  memberLabel: (uid: string) => string,
): string {
  const targetLabel = getSplitTargetLabel(expense, memberLabel);
  const splitMemberCount = getSplitMemberIds(expense, memberIds).length;
  if (splitMemberCount <= 1) {
    return `Split · ${targetLabel}`;
  }

  return expense.splitAmounts !== null
    ? `Split · ${targetLabel} (custom)`
    : `Split · ${targetLabel} (even)`;
}

function formatTotal(min: number, max: number, currency: string) {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  });
  const minimum = formatter.format(min);
  return min === max ? minimum : `${minimum}–${formatter.format(max)}`;
}

interface ExpenseCluster {
  groupLabel: string | null;
  items: TripExpense[];
}

/** Clusters consecutive-or-not expenses that share a `groupLabel` (e.g. itemized
 * entries off one receipt) so they can be rendered together with a subtotal,
 * while un-grouped expenses stay standalone in their original order. A Map key
 * (falling back to the item's own id when there's no group) collapses same-label
 * items while preserving first-occurrence order for everything else. */
function clusterByGroup(items: TripExpense[]): ExpenseCluster[] {
  return Array.from(
    items
      .reduce((clusters, item) => {
        const key = item.groupLabel ?? `__single-${item.id}`;
        const existing = clusters.get(key);
        clusters.set(key, {
          groupLabel: item.groupLabel,
          items: [...(existing?.items ?? []), item],
        });
        return clusters;
      }, new Map<string, ExpenseCluster>())
      .values(),
  );
}

function ExpensesSection({ trip, currentUserId }: ExpensesSectionProps) {
  const dispatch = useAppDispatch();
  const expenses = useAppSelector(selectTripExpenses);
  const [sortBy, setSortBy] = useState<SortBy>('day');
  const [dayFilter, setDayFilter] = useState<string[]>([]);
  const [payerFilter, setPayerFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory[]>([]);
  const [rangedOnly, setRangedOnly] = useState(false);
  const [splitOnly, setSplitOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [payingExpense, setPayingExpense] = useState<TripExpense | null>(null);
  const [editingExpense, setEditingExpense] = useState<TripExpense | null>(null);
  const [splittingExpense, setSplittingExpense] = useState<TripExpense | null>(null);
  const [isSplitSubmitting, setIsSplitSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const currency = trip.defaultCurrency ?? 'USD';
  const memberIds = Object.keys(trip.members);
  const memberInfo = useUserInfo(memberIds);
  const canAddExpenses = ['ADMIN', 'EDITOR'].includes(
    trip.members[currentUserId]?.role ?? '',
  );
  const memberLabel = (uid: string) =>
    memberInfo?.map[uid]?.displayName || memberInfo?.map[uid]?.email || uid;
  const existingGroupLabels = useMemo(
    () =>
      Array.from(
        new Set(
          expenses
            .map((expense) => expense.groupLabel)
            .filter((label): label is string => label !== null),
        ),
      ).sort(),
    [expenses],
  );
  const filteredExpenses = expenses.filter((expense) => {
    const matchesDay =
      dayFilter.length === 0 ||
      (expense.dayIndex === null
        ? dayFilter.includes('other')
        : dayFilter.includes(String(expense.dayIndex)));
    const matchesPayer =
      payerFilter.length === 0 ||
      (expense.payerUid !== null && payerFilter.includes(expense.payerUid));
    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(expense.status);
    const matchesCategory =
      categoryFilter.length === 0 || categoryFilter.includes(expense.category);
    const matchesRanged = !rangedOnly || expense.amount === null;
    const matchesSplit = !splitOnly || isCustomSplit(expense);
    const matchesSearch =
      searchQuery.trim() === '' ||
      expense.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return (
      matchesDay &&
      matchesPayer &&
      matchesStatus &&
      matchesCategory &&
      matchesRanged &&
      matchesSplit &&
      matchesSearch
    );
  });
  const hasActiveFilters =
    dayFilter.length > 0 ||
    payerFilter.length > 0 ||
    statusFilter.length > 0 ||
    categoryFilter.length > 0 ||
    rangedOnly ||
    splitOnly ||
    searchQuery.trim() !== '';
  const toggleFilterValue = <T,>(current: T[], value: T): T[] =>
    current.includes(value) ? current.filter((filterValue) => filterValue !== value) : [...current, value];
  const clearFilters = () => {
    setDayFilter([]);
    setPayerFilter([]);
    setStatusFilter([]);
    setCategoryFilter([]);
    setRangedOnly(false);
    setSplitOnly(false);
    setSearchQuery('');
  };
  const totals = computeExpenseTotals(filteredExpenses);
  const totalCards: { label: string; total: TripExpenseTotals['total'] }[] = [
    { label: 'Paid so far', total: totals.paid },
    { label: 'Expected (not yet paid)', total: totals.expected },
    { label: 'Total', total: totals.total },
  ];
  const duesSummary = computeDuesSummary(expenses, memberIds);

  const sortedExpenses =
    sortBy === 'amount'
      ? [...filteredExpenses].sort((a, b) => getSortAmount(b) - getSortAmount(a))
      : filteredExpenses;

  const dayGroups =
    sortBy === 'day'
      ? Array.from(
          sortedExpenses
            .reduce<Map<number | null, TripExpense[]>>((byDay, expense) => {
              byDay.set(expense.dayIndex, [...(byDay.get(expense.dayIndex) ?? []), expense]);
              return byDay;
            }, new Map())
            .entries(),
        )
          .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
          .map(([dayIndex, items]) => ({ dayIndex, items }))
      : null;

  const handleSubmit = async (values: ExpenseSubmitValues) => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (editingExpense) {
        await dispatch(
          updateExpense({
            expense: editingExpense,
            title: values.title,
            amount: values.amount,
            amountMin: values.amountMin,
            amountMax: values.amountMax,
            payerUid: values.payerUid,
            status: values.status,
            dayIndex: values.dayIndex,
            paidAmount: values.paidAmount,
            category: values.category,
            customCategoryLabel: values.customCategoryLabel,
            note: values.note,
            groupLabel: values.groupLabel,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createExpense({
            uid: currentUserId,
            tripId: trip.id,
            memberIds: Object.keys(trip.members),
            ...values,
          }),
        ).unwrap();
      }
      setEditingExpense(null);
      setIsModalOpen(false);
    } catch (submitError) {
      setError(
        getErrorMessage(
          submitError,
          editingExpense
            ? 'Unable to update this expense.'
            : 'Unable to add this expense.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (expense: TripExpense) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await dispatch(deleteExpense(expense)).unwrap();
      setEditingExpense(null);
      setIsModalOpen(false);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this expense.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkPaid = async (expense: TripExpense, paidAmount: number | null) => {
    setMarkingPaidId(expense.id);
    setError(null);
    try {
      await dispatch(markExpensePaid({ expense, paidAmount })).unwrap();
      setPayingExpense(null);
    } catch (markError) {
      setError(getErrorMessage(markError, 'Unable to mark this expense as paid.'));
    } finally {
      setMarkingPaidId(null);
    }
  };

  const handleMarkPaidClick = (expense: TripExpense) => {
    if (expense.amount === null) {
      setPayingExpense(expense);
      return;
    }

    void handleMarkPaid(expense, null);
  };

  const handleSplitSubmit = async (values: ExpenseSplitSubmitValues) => {
    if (!splittingExpense) {
      return;
    }
    setIsSplitSubmitting(true);
    setError(null);
    try {
      await dispatch(
        updateExpenseSplit({ expense: splittingExpense, ...values }),
      ).unwrap();
      setSplittingExpense(null);
    } catch (splitError) {
      setError(getErrorMessage(splitError, 'Unable to update this split.'));
    } finally {
      setIsSplitSubmitting(false);
    }
  };

  const renderExpenseRow = (expense: TripExpense) => {
    const splitDescription = describeSplit(expense, memberIds, memberLabel);
    const payerLine =
      expense.status === 'PAID'
        ? expense.payerUid
          ? memberLabel(expense.payerUid)
          : 'Paid by each person'
        : 'Not yet paid';

    return (
      <li key={expense.id} className='flex flex-wrap items-center justify-between gap-3 py-3'>
        <div className='min-w-0'>
          <p className='font-medium'>{expense.title}</p>
          <p className='text-muted-foreground text-sm'>
            {expense.status === 'PAID' ? 'Paid' : 'Expected'} · {payerLine}
          </p>
          <div className='mt-1 flex flex-wrap gap-1'>
            <Badge variant='muted' outline>
              {getExpenseCategoryLabel(expense)}
            </Badge>
            <Badge variant='muted' outline>
              {splitDescription}
            </Badge>
          </div>
          {expense.note && <p className='text-muted-foreground mt-1 text-sm italic'>{expense.note}</p>}
        </div>
        <div className='flex items-center gap-3'>
          <span className='font-medium'>
            {expense.status === 'PAID' && expense.paidAmount !== null
              ? formatTotal(expense.paidAmount, expense.paidAmount, expense.currency)
              : formatTotal(
                  expense.amount ?? expense.amountMin ?? 0,
                  expense.amount ?? expense.amountMax ?? expense.amountMin ?? 0,
                  expense.currency,
                )}
          </span>
          {canAddExpenses && expense.status === 'EXPECTED' && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              disabled={markingPaidId === expense.id}
              onClick={() => handleMarkPaidClick(expense)}
            >
              {markingPaidId === expense.id ? 'Marking…' : 'Mark paid'}
            </Button>
          )}
          {canAddExpenses && getResolvedExpenseAmount(expense) !== null && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => setSplittingExpense(expense)}
            >
              Edit split
            </Button>
          )}
          {canAddExpenses && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => {
                setEditingExpense(expense);
                setIsModalOpen(true);
              }}
            >
              Modify
            </Button>
          )}
        </div>
      </li>
    );
  };

  const renderClusters = (items: TripExpense[]) =>
    clusterByGroup(items).map((cluster) => {
      if (cluster.groupLabel === null) {
        return renderExpenseRow(cluster.items[0]);
      }

      const groupTotals = computeExpenseTotals(cluster.items);

      return (
        <li key={`group-${cluster.groupLabel}`} className='border-border rounded-lg border py-1'>
          <div className='flex items-center justify-between px-3 py-2'>
            <span className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              {cluster.groupLabel}
            </span>
            <span className='text-muted-foreground text-xs font-medium'>
              {formatTotal(groupTotals.total.min, groupTotals.total.max, currency)}
            </span>
          </div>
          <ul className='divide-border divide-y px-3'>{cluster.items.map(renderExpenseRow)}</ul>
        </li>
      );
    });

  const renderDivider = (label: string) => (
    <div className='flex items-center gap-3'>
      <div className='border-border flex-1 border-t' />
      <span className='text-muted-foreground text-sm font-medium'>{label}</span>
      <div className='border-border flex-1 border-t' />
    </div>
  );

  return (
    <section className='space-y-5 pt-4'>
      <div className='flex items-center justify-between gap-3'>
        <h2 className='text-xl font-semibold'>Expenses</h2>
        {canAddExpenses && (
          <Button
            onClick={() => {
              setEditingExpense(null);
              setIsModalOpen(true);
            }}
          >
            Add expense
          </Button>
        )}
      </div>
      <div className='grid gap-3 sm:grid-cols-3'>
        {totalCards.map(({ label, total }) => (
          <div key={label} className='border-border rounded-lg border p-3'>
            <p className='text-muted-foreground text-sm'>{label}</p>
            <p className='mt-1 text-lg font-semibold'>
              {formatTotal(total.min, total.max, currency)}
            </p>
          </div>
        ))}
      </div>
      <div className='border-border rounded-lg border p-3'>
        <p className='text-sm font-medium'>Dues summary</p>
        {duesSummary.debts.length === 0 ? (
          <p className='text-muted-foreground mt-1 text-sm'>
            Everyone&apos;s settled up.
          </p>
        ) : (
          <ul className='mt-2 space-y-1'>
            {duesSummary.debts.map((debt) => (
              <li key={`${debt.from}-${debt.to}`} className='text-sm'>
                {memberLabel(debt.from)} owes {memberLabel(debt.to)}{' '}
                <span className='font-medium'>
                  {formatTotal(debt.amount, debt.amount, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className='flex items-center gap-3'>
        <span className='text-muted-foreground text-sm font-medium'>Sort by</span>
        <Tabs
          value={sortBy}
          onValueChange={(value) => setSortBy(value as SortBy)}
          tabsList={[
            { value: 'day', label: 'Day' },
            { value: 'amount', label: 'Amount' },
          ]}
          variant='pills'
        />
      </div>
      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <span className='text-muted-foreground text-sm font-medium'>
            Filter by
          </span>
          {hasActiveFilters && (
            <Button
              type='button'
              variant='link'
              size='sm'
              onClick={clearFilters}
              aria-label='Clear filters'
              className='bg-transparent'
            >
              Clear
            </Button>
          )}
        </div>
        <Input
          type='search'
          placeholder='Search expenses'
          aria-label='Search expenses by title'
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <div className='flex flex-wrap items-center gap-4'>
          <label className='text-muted-foreground inline-flex w-fit items-center gap-2 text-sm'>
            <AppToggle size='sm' checked={splitOnly} onCheckedChange={setSplitOnly} />
            Custom split only
          </label>
          <label className='text-muted-foreground inline-flex w-fit items-center gap-2 text-sm'>
            <AppToggle size='sm' checked={rangedOnly} onCheckedChange={setRangedOnly} />
            Estimated range only
          </label>
        </div>
        <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2'>
          <span className='text-muted-foreground text-sm sm:w-16 sm:shrink-0'>
            Status
          </span>
          <div role='group' aria-label='Filter by status' className='flex flex-wrap gap-2'>
            {(['PAID', 'EXPECTED'] as const).map((status) => {
              const isSelected = statusFilter.includes(status);

              return (
                <Button
                  key={status}
                  type='button'
                  variant='base'
                  size='sm'
                  aria-pressed={isSelected}
                  onClick={() => setStatusFilter((current) => toggleFilterValue(current, status))}
                >
                  <Badge variant={isSelected ? 'primary' : 'muted'} outline={!isSelected}>
                    {status === 'PAID' ? 'Paid' : 'Expecting'}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </div>
        <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2'>
          <span className='text-muted-foreground text-sm sm:w-16 sm:shrink-0'>
            Category
          </span>
          <div role='group' aria-label='Filter by category' className='flex flex-wrap gap-2'>
            {EXPENSE_CATEGORIES.map((category) => {
              const isSelected = categoryFilter.includes(category);

              return (
                <Button
                  key={category}
                  type='button'
                  variant='base'
                  size='sm'
                  aria-pressed={isSelected}
                  onClick={() => setCategoryFilter((current) => toggleFilterValue(current, category))}
                >
                  <Badge variant={isSelected ? 'primary' : 'muted'} outline={!isSelected}>
                    {EXPENSE_CATEGORY_LABELS[category]}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </div>
        <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2'>
          <span className='text-muted-foreground text-sm sm:w-16 sm:shrink-0'>
            Days
          </span>
          <div
            role='group'
            aria-label='Filter by day'
            className='flex flex-wrap gap-2'
          >
            {Array.from({ length: dayCount }, (_, index) => {
              const value = String(index);
              const isSelected = dayFilter.includes(value);

              return (
                <Button
                  key={value}
                  type='button'
                  variant='base'
                  size='sm'
                  aria-pressed={isSelected}
                  onClick={() => setDayFilter((current) => toggleFilterValue(current, value))}
                >
                  <Badge
                    variant={isSelected ? 'primary' : 'muted'}
                    outline={!isSelected}
                  >
                    Day {index + 1}
                  </Badge>
                </Button>
              );
            })}
            <Button
              type='button'
              variant='base'
              size='sm'
              aria-pressed={dayFilter.includes('other')}
              onClick={() => setDayFilter((current) => toggleFilterValue(current, 'other'))}
            >
              <Badge
                variant={dayFilter.includes('other') ? 'primary' : 'muted'}
                outline={!dayFilter.includes('other')}
              >
                No specific day
              </Badge>
            </Button>
          </div>
        </div>
        <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2'>
          <span className='text-muted-foreground text-sm sm:w-16 sm:shrink-0'>
            Member
          </span>
          <div
            role='group'
            aria-label='Filter by person'
            className='flex flex-wrap items-center gap-2'
          >
            {memberIds.map((uid) => {
              const isSelected = payerFilter.includes(uid);

              return (
                <Button
                  key={uid}
                  type='button'
                  variant='base'
                  size='sm'
                  aria-pressed={isSelected}
                  onClick={() => setPayerFilter((current) => toggleFilterValue(current, uid))}
                >
                  <Badge
                    variant={isSelected ? 'primary' : 'muted'}
                    outline={!isSelected}
                  >
                    {memberLabel(uid)}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
      {filteredExpenses.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          No expenses for this selection.
        </p>
      ) : dayGroups ? (
        <div className='space-y-3'>
          {dayGroups.map(({ dayIndex, items }) => (
            <div key={dayIndex ?? 'no-day'} className='space-y-3'>
              {renderDivider(dayIndex === null ? 'No specific day' : getDayLabel(trip.startDate, dayIndex))}
              <ul className='divide-border divide-y'>{renderClusters(items)}</ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className='divide-border divide-y'>{renderClusters(sortedExpenses)}</ul>
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <ExpenseFormModal
        key={`${editingExpense?.id ?? 'new'}-${isModalOpen ? 'open' : 'closed'}`}
        isOpen={isModalOpen}
        trip={trip}
        initialExpense={editingExpense ?? undefined}
        existingGroupLabels={existingGroupLabels}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingExpense ? () => handleDelete(editingExpense) : undefined}
        onClose={() => {
          setEditingExpense(null);
          setIsModalOpen(false);
        }}
      />
      <MarkExpensePaidModal
        isOpen={payingExpense !== null}
        expense={payingExpense}
        isSubmitting={payingExpense !== null && markingPaidId === payingExpense.id}
        onSubmit={(paidAmount) => {
          if (payingExpense) {
            void handleMarkPaid(payingExpense, paidAmount);
          }
        }}
        onClose={() => setPayingExpense(null)}
      />
      <ExpenseSplitModal
        key={splittingExpense?.id ?? 'none'}
        isOpen={splittingExpense !== null}
        trip={trip}
        expense={splittingExpense}
        isSubmitting={isSplitSubmitting}
        onSubmit={handleSplitSubmit}
        onClose={() => setSplittingExpense(null)}
      />
    </section>
  );
}

export default ExpensesSection;
