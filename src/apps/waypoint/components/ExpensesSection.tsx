import { useMemo, useState } from 'react';

import { Badge, Button, Drawer, Input, Select } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ListFilter } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getDayCount, getDayLabel } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { EXPENSE_SORT_OPTIONS, EXPENSE_TOTALS_VIEW_OPTIONS } from '@apps/waypoint/constants';
import type { ExpenseSubmitValues } from '@apps/waypoint/components/ExpenseFormModal';
import ExpenseFormModal from '@apps/waypoint/components/ExpenseFormModal';
import ExpenseSplitModal, {
  type ExpenseSplitSubmitValues,
} from '@apps/waypoint/components/ExpenseSplitModal';
import MarkExpensePaidModal, {
  type MarkExpensePaidValues,
} from '@apps/waypoint/components/MarkExpensePaidModal';
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
import type {
  ExpenseSortBy,
  ExpenseStatus,
  ExpenseTotalsView,
  TripExpense,
  TripSpace,
} from '@apps/waypoint/types';
import {
  getExpenseCategoryKey,
  getExpenseCategoryKeyLabel,
  getExpenseCategoryKeys,
} from '@apps/waypoint/utils/expenseCategories';
import { isTripDateShiftLocked } from '@apps/waypoint/utils/roleGuards';
import {
  computeDuesSummary,
  getActiveSplitAmounts,
  getDebtExpenses,
  getPerPersonMultiplier,
  getResolvedExpenseAmount,
  getSplitMemberIds,
  scaleAmount,
} from '@apps/waypoint/utils/splitCalculators';

interface ExpensesSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

function isCustomSplit(expense: TripExpense, memberIds: string[]): boolean {
  return (
    !['EVERYONE_CURRENT', 'EVERYONE_INCLUDING_FUTURE'].includes(expense.targetType) ||
    getActiveSplitAmounts(expense, memberIds) !== null
  );
}

function getSortAmount(expense: TripExpense, memberIds: string[]): number {
  const multiplier = getPerPersonMultiplier(expense, getSplitMemberIds(expense, memberIds));
  const amount = scaleAmount(
    getResolvedExpenseAmount(expense) ?? expense.amountMax ?? expense.amountMin ?? 0,
    multiplier,
  );
  return amount;
}

function getDisplayRange(expense: TripExpense): { min: number; max: number } {
  if (expense.status === 'PAID' && expense.paidAmount !== null) {
    return { min: expense.paidAmount, max: expense.paidAmount };
  }

  const range = {
    min: expense.amount ?? expense.amountMin ?? 0,
    max: expense.amount ?? expense.amountMax ?? expense.amountMin ?? 0,
  };
  return range;
}

function getSplitTargetLabel(
  expense: TripExpense,
  memberLabel: (uid: string) => string,
): string {
  switch (expense.targetType) {
    case 'EVERYONE_CURRENT':
    case 'EVERYONE_INCLUDING_FUTURE':
      return 'Everyone';
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

  return getActiveSplitAmounts(expense, memberIds) !== null
    ? `Split · ${targetLabel} (custom)`
    : `Split · ${targetLabel} (even)`;
}

function formatTotal(min: number, max: number, currency: string) {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  });
  const minimum = formatter.format(min);
  return min === max ? minimum : `${minimum}-${formatter.format(max)}`;
}

interface ExpenseCluster {
  groupLabel: string | null;
  items: TripExpense[];
}

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
  const [sortBy, setSortBy] = useState<ExpenseSortBy>('day');
  const [totalsView, setTotalsView] = useState<ExpenseTotalsView>('per-person');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [dayFilter, setDayFilter] = useState<string[]>([]);
  const [payerFilter, setPayerFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
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
  const currency = 'USD';
  const memberIds = Object.keys(trip.members);
  const memberInfo = useUserInfo(memberIds);
  const canAddExpenses =
    !isTripDateShiftLocked(trip) &&
    ['ADMIN', 'EDITOR'].includes(trip.members[currentUserId]?.role ?? '');
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
  const categoryKeys = useMemo(() => getExpenseCategoryKeys(expenses), [expenses]);
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
      categoryFilter.length === 0 || categoryFilter.includes(getExpenseCategoryKey(expense));
    const matchesRanged = !rangedOnly || expense.amount === null;
    const matchesSplit = !splitOnly || isCustomSplit(expense, memberIds);
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
  const activeFilterCount =
    dayFilter.length +
    payerFilter.length +
    statusFilter.length +
    categoryFilter.length +
    Number(rangedOnly) +
    Number(splitOnly);
  const toggleFilterValue = <T,>(current: T[], value: T): T[] =>
    current.includes(value) ? current.filter((filterValue) => filterValue !== value) : [...current, value];
  const clearFilters = () => {
    setDayFilter([]);
    setPayerFilter([]);
    setStatusFilter([]);
    setCategoryFilter([]);
    setRangedOnly(false);
    setSplitOnly(false);
  };
  const toTotalsView = (total: TripExpenseTotals['total']): TripExpenseTotals['total'] => {
    if (totalsView === 'group') {
      return total;
    }

    const headcount = Math.max(1, memberIds.length);
    const perPerson = {
      min: scaleAmount(total.min, 1 / headcount),
      max: scaleAmount(total.max, 1 / headcount),
    };
    return perPerson;
  };
  const totals = computeExpenseTotals(expenses, memberIds);
  const filteredTotal = toTotalsView(computeExpenseTotals(filteredExpenses, memberIds).total);
  const totalCards: { label: string; total: TripExpenseTotals['total'] }[] = [
    { label: 'Paid', total: toTotalsView(totals.paid) },
    { label: 'Expected', total: toTotalsView(totals.expected) },
    { label: 'Total', total: toTotalsView(totals.total) },
  ];
  const duesSummary = computeDuesSummary(expenses, memberIds);

  const sortedExpenses =
    sortBy === 'day'
      ? filteredExpenses
      : [...filteredExpenses].sort((a, b) =>
          sortBy === 'amount-desc'
            ? getSortAmount(b, memberIds) - getSortAmount(a, memberIds)
            : getSortAmount(a, memberIds) - getSortAmount(b, memberIds),
        );

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
            isPerPerson: values.isPerPerson,
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

  const handleMarkPaid = async (expense: TripExpense, values: MarkExpensePaidValues) => {
    setMarkingPaidId(expense.id);
    setError(null);
    try {
      await dispatch(markExpensePaid({ expense, ...values })).unwrap();
      setPayingExpense(null);
    } catch (markError) {
      setError(getErrorMessage(markError, 'Unable to mark this expense as paid.'));
    } finally {
      setMarkingPaidId(null);
    }
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
    const displayRange = getDisplayRange(expense);
    const multiplier = getPerPersonMultiplier(expense, getSplitMemberIds(expense, memberIds));

    return (
      <li
        key={expense.id}
        className='grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 py-3'
      >
        <div className='col-span-2 min-w-0 sm:col-span-1'>
          <p className='font-medium'>{expense.title}</p>
          <p className='text-muted-foreground text-sm'>
            {expense.status === 'PAID' ? 'Paid' : 'Expected'} · {payerLine}
          </p>
          <div className='mt-1 flex flex-wrap gap-1'>
            <Badge variant='muted' outline>
              {getExpenseCategoryKeyLabel(getExpenseCategoryKey(expense))}
            </Badge>
            {expense.status === 'PAID' && (
              <Badge variant='muted' outline>
                {splitDescription}
              </Badge>
            )}
          </div>
          {expense.note && <p className='text-muted-foreground mt-1 text-sm italic'>{expense.note}</p>}
        </div>
        <div className='col-start-1 whitespace-nowrap'>
          <p className='font-medium'>
            {formatTotal(displayRange.min, displayRange.max, expense.currency)}
            {expense.isPerPerson && (
              <span className='text-muted-foreground text-sm font-normal'> per person</span>
            )}
          </p>
          {expense.isPerPerson && (
            <p className='text-muted-foreground text-xs'>
              {formatTotal(
                scaleAmount(displayRange.min, multiplier),
                scaleAmount(displayRange.max, multiplier),
                expense.currency,
              )}{' '}
              total for {multiplier} {multiplier === 1 ? 'person' : 'people'}
            </p>
          )}
        </div>
        <div className='flex flex-wrap items-center justify-end gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1'>
          {canAddExpenses && expense.status === 'EXPECTED' && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              disabled={markingPaidId === expense.id}
              onClick={() => setPayingExpense(expense)}
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
    clusterByGroup(items).map((cluster, index) => {
      if (cluster.groupLabel === null) {
        return renderExpenseRow(cluster.items[0]);
      }

      const groupTotals = computeExpenseTotals(cluster.items, memberIds);

      return (
        <li key={`group-${cluster.groupLabel}-${index}`} className='border-border rounded-lg border py-1'>
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

  const renderChipGroup = (
    label: string,
    options: { value: string; label: string }[],
    selected: string[],
    onToggle: (value: string) => void,
  ) => (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-sm font-medium'>{label}</p>
      <div role='group' aria-label={`Filter by ${label.toLowerCase()}`} className='flex flex-wrap gap-2'>
        {options.map((option) => {
          const isSelected = selected.includes(option.value);

          return (
            <Button
              key={option.value}
              type='button'
              variant='base'
              size='sm'
              aria-pressed={isSelected}
              onClick={() => onToggle(option.value)}
            >
              <Badge variant={isSelected ? 'primary' : 'muted'} outline={!isSelected}>
                {option.label}
              </Badge>
            </Button>
          );
        })}
      </div>
    </div>
  );

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
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='text-muted-foreground text-sm'>{label}</p>
              <div className='border-border flex items-center gap-1 rounded-md border p-0.5'>
                {EXPENSE_TOTALS_VIEW_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type='button'
                    variant={totalsView === option.value ? 'primary' : 'secondary'}
                    size='sm'
                    aria-pressed={totalsView === option.value}
                    className={join(
                      'h-6 px-2 text-xs',
                      totalsView !== option.value && 'bg-transparent',
                    )}
                    onClick={() => setTotalsView(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
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
            {duesSummary.debts.map((debt) => {
              const debtItems = getDebtExpenses(debt, expenses, memberIds)
                .map((expense) => expense.title)
                .join(', ');

              return (
                <li key={`${debt.from}-${debt.to}`} className='text-sm'>
                  {memberLabel(debt.from)} owes {memberLabel(debt.to)}{' '}
                  <span className='font-medium'>
                    {formatTotal(debt.amount, debt.amount, currency)}
                  </span>
                  {debtItems && <span className='text-muted-foreground'> ({debtItems})</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className='flex items-center gap-2'>
        <div className='min-w-0 flex-1'>
          <Input
            type='search'
            placeholder='Search expenses'
            aria-label='Search expenses by title'
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className='h-10'
          />
        </div>
        <Select
          className='w-44 shrink-0'
          options={EXPENSE_SORT_OPTIONS}
          value={sortBy}
          onChange={(value) => setSortBy(value as ExpenseSortBy)}
        />
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          aria-label={
            activeFilterCount > 0 ? `Filters (${activeFilterCount} applied)` : 'Filters'
          }
          className='relative shrink-0'
          onClick={() => setIsFilterDrawerOpen(true)}
        >
          <ListFilter className='h-4 w-4' />
          {activeFilterCount > 0 && (
            <span className='bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold'>
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>
      <Drawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        title='Filters'
        footer={
          <div className='flex items-center justify-between gap-2'>
            <Button
              type='button'
              variant='link'
              size='sm'
              disabled={activeFilterCount === 0}
              onClick={clearFilters}
            >
              Clear all
            </Button>
            <Button type='button' onClick={() => setIsFilterDrawerOpen(false)}>
              Show {filteredExpenses.length} {filteredExpenses.length === 1 ? 'expense' : 'expenses'}
            </Button>
          </div>
        }
      >
        <div className='space-y-5'>
          <div className='flex flex-col gap-3'>
            <label className='text-muted-foreground inline-flex w-fit items-center gap-2 text-sm'>
              <AppToggle size='sm' checked={splitOnly} onCheckedChange={setSplitOnly} />
              Custom split only
            </label>
            <label className='text-muted-foreground inline-flex w-fit items-center gap-2 text-sm'>
              <AppToggle size='sm' checked={rangedOnly} onCheckedChange={setRangedOnly} />
              Estimated range only
            </label>
          </div>
          {renderChipGroup(
            'Status',
            (['PAID', 'EXPECTED'] as const).map((status) => ({
              value: status,
              label: status === 'PAID' ? 'Paid' : 'Expecting',
            })),
            statusFilter,
            (value) => setStatusFilter((current) => toggleFilterValue(current, value as ExpenseStatus)),
          )}
          {renderChipGroup(
            'Category',
            categoryKeys.map((key) => ({ value: key, label: getExpenseCategoryKeyLabel(key) })),
            categoryFilter,
            (value) => setCategoryFilter((current) => toggleFilterValue(current, value)),
          )}
          {renderChipGroup(
            'Day',
            [
              ...Array.from({ length: dayCount }, (_, index) => ({
                value: String(index),
                label: `Day ${index + 1}`,
              })),
              { value: 'other', label: 'No specific day' },
            ],
            dayFilter,
            (value) => setDayFilter((current) => toggleFilterValue(current, value)),
          )}
          {renderChipGroup(
            'Paid by',
            memberIds.map((uid) => ({ value: uid, label: memberLabel(uid) })),
            payerFilter,
            (value) => setPayerFilter((current) => toggleFilterValue(current, value)),
          )}
        </div>
      </Drawer>
      {filteredExpenses.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          No expenses for this selection.
        </p>
      ) : (
        <div className='space-y-3'>
          <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1'>
            <p className='text-sm font-medium whitespace-nowrap'>
              {filteredExpenses.length === expenses.length ? 'All expenses' : 'Filtered expenses'}{' '}
              <span className='text-muted-foreground font-normal'>({filteredExpenses.length})</span>
            </p>
            <p className='text-sm font-semibold whitespace-nowrap'>
              {formatTotal(filteredTotal.min, filteredTotal.max, currency)}
              {totalsView === 'per-person' && (
                <span className='text-muted-foreground font-normal'> per person</span>
              )}
            </p>
          </div>
          {dayGroups ? (
            dayGroups.map(({ dayIndex, items }) => (
              <div key={dayIndex ?? 'no-day'} className='space-y-3'>
                {renderDivider(dayIndex === null ? 'No specific day' : getDayLabel(trip.startDate, dayIndex))}
                <ul className='divide-border divide-y'>{renderClusters(items)}</ul>
              </div>
            ))
          ) : (
            <ul className='divide-border divide-y'>{renderClusters(sortedExpenses)}</ul>
          )}
        </div>
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <ExpenseFormModal
        key={`${editingExpense?.id ?? 'new'}-${isModalOpen ? 'open' : 'closed'}`}
        isOpen={isModalOpen}
        trip={trip}
        initialExpense={editingExpense ?? undefined}
        categoryKeys={categoryKeys}
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
        key={`paying-${payingExpense?.id ?? 'none'}`}
        isOpen={payingExpense !== null}
        trip={trip}
        expense={payingExpense}
        isSubmitting={payingExpense !== null && markingPaidId === payingExpense.id}
        onSubmit={(values) => {
          if (payingExpense) {
            void handleMarkPaid(payingExpense, values);
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
