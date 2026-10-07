import { memo, useMemo, useState, type CSSProperties } from 'react';

import {
  Button,
  Disclosure,
  Drawer,
  Input,
  Select,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, ListFilter } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import LazyMount from '@/components/LazyMount';
import DetailSheet from '@/components/DetailSheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getBucketLabel, getDayCount, getDayLabel, groupByIndexBucket } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  EXPENSE_SORT_OPTIONS,
  EXPENSE_TOTALS_VIEW_HINTS,
  EXPENSE_TOTALS_VIEW_OPTIONS,
} from '@apps/waypoint/constants';
import type { ExpenseSubmitValues } from '@apps/waypoint/components/ExpenseFormModal';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import EarlyPaymentModal from '@apps/waypoint/components/EarlyPaymentModal';
import DuesSummary from '@apps/waypoint/components/DuesSummary';
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
  removeEarlyPayment,
  setEarlyPayment,
  setEarlyPaymentReturned,
  toggleExpenseRepaid,
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
import {
  computeEvenSplit,
  computeMemberTotals,
  getMemberShareRange,
  computePairSettlements,
  isPairSettled,
  getActiveSplitAmounts,
  getEarlyPaymentLimit,
  getEarlyPayments,
  getExpenseTotalAmount,
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

const EAGER_DAYS = 3;
const ESTIMATED_ROW_HEIGHT = 72;

const currencyFormatters = new Map<string, Intl.NumberFormat>();

// An en dash, not a hyphen: it lets a long range wrap there instead of overflowing its box.
function formatTotal(min: number, max: number, currency: string) {
  const formatter =
    currencyFormatters.get(currency) ?? new Intl.NumberFormat(undefined, { style: 'currency', currency });
  currencyFormatters.set(currency, formatter);
  const minimum = formatter.format(min);
  return min === max ? minimum : `${minimum}\u2013${formatter.format(max)}`;
}

interface SplitShare {
  uid: string;
  amountLabel: string;
  isPaid: boolean;
}

interface SplitBreakdown {
  /** Set only for an even split — one shared "$X per person" line instead of naming everyone. */
  perPersonLabel: string | null;
  /** Every debtor (payer excluded — they don't owe themselves). */
  shares: SplitShare[];
  /** The payer's own part of a custom split, shown last so the list adds up to the total. */
  payerShare: SplitShare | null;
}

function getSplitBreakdown(expense: TripExpense, memberIds: string[]): SplitBreakdown | null {
  const splitMemberIds = getSplitMemberIds(expense, memberIds);
  const total = getExpenseTotalAmount(expense, memberIds);
  if (expense.status !== 'PAID' || splitMemberIds.length <= 1 || total === null) {
    return null;
  }

  const customAmounts = getActiveSplitAmounts(expense, memberIds);
  const amounts = customAmounts ?? computeEvenSplit(splitMemberIds, total);
  // A null payer means everyone already paid their own share directly — no one owes
  // anyone, so there's nothing to mark repaid.
  const shares =
    expense.payerUid === null
      ? []
      : splitMemberIds
          .filter((uid) => uid !== expense.payerUid)
          .map((uid) => ({
            uid,
            amountLabel: formatTotal(amounts[uid] ?? 0, amounts[uid] ?? 0, expense.currency),
            isPaid: (expense.paidMemberStatus ?? {})[uid]?.isPaid ?? false,
          }));

  const perPersonLabel =
    customAmounts === null
      ? `${formatTotal(amounts[splitMemberIds[0]] ?? 0, amounts[splitMemberIds[0]] ?? 0, expense.currency)} per person`
      : null;

  const payerAmount = expense.payerUid === null ? undefined : amounts[expense.payerUid];
  const payerShare =
    customAmounts !== null && expense.payerUid !== null && payerAmount !== undefined
      ? { uid: expense.payerUid, amountLabel: formatTotal(payerAmount, payerAmount, expense.currency), isPaid: true }
      : null;

  return { perPersonLabel, shares, payerShare };
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
  const { confirm } = useActionModal();
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
  const [earlyExpense, setEarlyExpense] = useState<TripExpense | null>(null);
  const [isDuesOpen, setIsDuesOpen] = useState(true);
  const [detailExpenseId, setDetailExpenseId] = useState<string | null>(null);
  const isSmallScreen = useMediaQuery().isBelow('sm');
  const [isSplitSubmitting, setIsSplitSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const currency = 'USD';
  const memberIds = useMemo(() => Object.keys(trip.members), [trip.members]);
  const memberInfo = useUserInfo(memberIds);
  const canAddExpenses = ['ADMIN', 'EDITOR'].includes(trip.members[currentUserId]?.role ?? '');
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
  const totals = useMemo(() => computeExpenseTotals(expenses, memberIds), [expenses, memberIds]);
  const myTotals = useMemo(
    () => computeMemberTotals(expenses, memberIds, currentUserId),
    [expenses, memberIds, currentUserId],
  );
  const filteredTotal =
    totalsView === 'me'
      ? computeMemberTotals(filteredExpenses, memberIds, currentUserId).myTotal
      : toTotalsView(computeExpenseTotals(filteredExpenses, memberIds).total);
  const totalCards: { label: string; total: TripExpenseTotals['total'] }[] =
    totalsView === 'me'
      ? [
          { label: 'Paid by me', total: myTotals.paidByMe },
          { label: 'Expected for me', total: myTotals.expectedForMe },
          { label: 'My total', total: myTotals.myTotal },
        ]
      : [
          { label: 'Paid', total: toTotalsView(totals.paid) },
          { label: 'Expected', total: toTotalsView(totals.expected) },
          { label: 'Total', total: toTotalsView(totals.total) },
        ];
  const pairSettlements = useMemo(() => computePairSettlements(expenses, memberIds), [expenses, memberIds]);
  const myOpenPairs = pairSettlements.filter(
    (settlement) => [settlement.personA, settlement.personB].includes(currentUserId) && !isPairSettled(settlement),
  ).length;

  const sortedExpenses =
    sortBy === 'day'
      ? filteredExpenses
      : [...filteredExpenses].sort((a, b) =>
          sortBy === 'amount-desc'
            ? getSortAmount(b, memberIds) - getSortAmount(a, memberIds)
            : getSortAmount(a, memberIds) - getSortAmount(b, memberIds),
        );

  const dayGroups =
    sortBy === 'day' ? groupByIndexBucket(sortedExpenses, (expense) => expense.dayIndex, dayCount) : null;

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
            linkedTo: values.linkedTo,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createExpense({
            uid: currentUserId,
            tripId: trip.id,
            memberIds: Object.keys(trip.members),
            ...values,
            split: values.split ?? { targetType: 'EVERYONE_CURRENT', targetMemberIds: [] },
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

  const runAction = async (action: Promise<unknown>, fallback: string) => {
    setError(null);
    try {
      await action;
    } catch (actionError) {
      setError(getErrorMessage(actionError, fallback));
    }
  };

  const handleRemoveEarlyFromDues = async (expenseId: string, fromUid: string) => {
    const confirmed = await confirm({
      title: 'Remove early payment',
      message: `Remove the early payment ${memberLabel(fromUid)} recorded? It stops counting in the Dues summary.`,
      destructive: true,
    });
    if (confirmed) {
      await runAction(
        dispatch(removeEarlyPayment({ uid: fromUid, tripId: trip.id, expenseId })).unwrap(),
        'Unable to remove this early payment.',
      );
    }
  };

  const handleSaveEarlyPayment = async (expense: TripExpense, values: { toUid: string; amount: number }) => {
    await dispatch(
      setEarlyPayment({ uid: currentUserId, tripId: trip.id, expenseId: expense.id, ...values }),
    ).unwrap();
    setEarlyExpense(null);
  };

  const handleRemoveEarlyPayment = async (expense: TripExpense) => {
    await dispatch(removeEarlyPayment({ uid: currentUserId, tripId: trip.id, expenseId: expense.id })).unwrap();
    setEarlyExpense(null);
  };

  const getPayerLine = (expense: TripExpense) =>
    expense.status === 'PAID'
      ? expense.payerUid
        ? `Paid by ${memberLabel(expense.payerUid)}`
        : 'Paid by each person'
      : 'Expected, not yet paid';

  const getActions = (expense: TripExpense) => [
    ...(canAddExpenses && expense.status === 'EXPECTED'
      ? [
          {
            key: 'mark-paid',
            label: 'Mark paid',
            description: 'Record who covered it and what it cost.',
            run: () => setPayingExpense(expense),
          },
        ]
      : []),
    ...(expense.status === 'EXPECTED' && getEarlyPaymentLimit(expense, memberIds, currentUserId).canPayEarly
      ? [
          {
            key: 'early-payment',
            label: getEarlyPayments(expense)[currentUserId] ? 'Edit my early payment' : 'Record an early payment',
            description: 'Money you already sent a teammate for this.',
            run: () => setEarlyExpense(expense),
          },
        ]
      : []),
    ...(canAddExpenses && getResolvedExpenseAmount(expense) !== null
      ? [
          {
            key: 'edit-split',
            label: 'Edit split',
            description: 'Choose who shares it and how much each owes.',
            run: () => setSplittingExpense(expense),
          },
        ]
      : []),
    ...(canAddExpenses
      ? [
          {
            key: 'modify',
            label: 'Modify',
            description: 'Change the details, or delete this expense.',
            run: () => {
              setEditingExpense(expense);
              setIsModalOpen(true);
            },
          },
        ]
      : []),
  ];

  const renderEarlyPayments = (expense: TripExpense) => {
    const entries = Object.entries(getEarlyPayments(expense));
    if (entries.length === 0) {
      return null;
    }

    return (
      <div className='mt-1 space-y-0.5'>
        <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>Paid early</p>
        {entries.map(([fromUid, payment]) => (
          <p key={fromUid} className='text-muted-foreground text-xs'>
            {memberLabel(fromUid)} → {memberLabel(payment.toUid)} ·{' '}
            {formatTotal(payment.amount, payment.amount, expense.currency)}
            {payment.isReturned ? ' · sent back' : expense.status === 'EXPECTED' ? ' · waiting for this to be paid' : ''}
          </p>
        ))}
      </div>
    );
  };

  const renderExpenseDetail = (expense: TripExpense) => {
    const splitDescription = describeSplit(expense, memberIds, memberLabel);
    const displayRange = getDisplayRange(expense);
    const multiplier = getPerPersonMultiplier(expense, getSplitMemberIds(expense, memberIds));
    const splitBreakdown = getSplitBreakdown(expense, memberIds);
    const repaidNames = (splitBreakdown?.shares ?? [])
      .filter((share) => share.isPaid)
      .map((share) => memberLabel(share.uid));
    const renderRepaidControl = (share: SplitShare | undefined) => {
      if (!share) {
        return null;
      }

      const toggle = () =>
        void dispatch(
          toggleExpenseRepaid({ uid: currentUserId, tripId: trip.id, expenseId: expense.id }),
        );

      if (!share.isPaid) {
        return (
          <Button type='button' variant='secondary' size='sm' className='h-10 shrink-0' onClick={toggle}>
            Mark as repaid
          </Button>
        );
      }

      return (
        <span className='inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap'>
          <span className='text-muted-foreground text-xs'>You repaid this</span>
          <Button type='button' variant='tertiary' size='sm' className='h-10' onClick={toggle}>
            Undo
          </Button>
        </span>
      );
    };

    return (
      <>
        <div className='min-w-0'>
          <p className='font-medium'>{expense.title}</p>
          <p className='text-muted-foreground text-sm'>
            {getExpenseCategoryKeyLabel(getExpenseCategoryKey(expense))} · {getPayerLine(expense)}
          </p>
          {expense.status === 'PAID' && <p className='text-muted-foreground text-xs'>{splitDescription}</p>}
          {renderEarlyPayments(expense)}
          {expense.note && <p className='text-muted-foreground mt-1 text-sm italic'>{expense.note}</p>}
        </div>
        <div className='col-span-2'>
          <p className='whitespace-nowrap font-medium'>
            {formatTotal(displayRange.min, displayRange.max, expense.currency)}
            {expense.isPerPerson && (
              <span className='text-muted-foreground text-sm font-normal'> per person</span>
            )}
          </p>
          {expense.isPerPerson && (
            <p className='text-muted-foreground whitespace-nowrap text-xs'>
              {formatTotal(
                scaleAmount(displayRange.min, multiplier),
                scaleAmount(displayRange.max, multiplier),
                expense.currency,
              )}{' '}
              total for {multiplier} {multiplier === 1 ? 'person' : 'people'}
            </p>
          )}
          {splitBreakdown && (
            <div className='mt-0.5 space-y-1'>
              {splitBreakdown.perPersonLabel !== null ? (
                <div className='flex items-baseline justify-end gap-2'>
                  {!expense.isPerPerson && (
                    <p className='text-muted-foreground mr-auto whitespace-nowrap text-xs'>
                      {splitBreakdown.perPersonLabel}
                    </p>
                  )}
                  {renderRepaidControl(
                    splitBreakdown.shares.find((share) => share.uid === currentUserId),
                  )}
                </div>
              ) : (
                splitBreakdown.shares.map((share) => (
                  <div key={share.uid} className='flex items-baseline justify-end gap-2'>
                    <p className='text-muted-foreground mr-auto whitespace-nowrap text-xs'>
                      {memberLabel(share.uid)} {share.amountLabel}
                    </p>
                    {share.uid === currentUserId && renderRepaidControl(share)}
                  </div>
                ))
              )}
              {splitBreakdown.payerShare && (
                <p className='text-muted-foreground text-xs'>
                  {memberLabel(splitBreakdown.payerShare.uid)} {splitBreakdown.payerShare.amountLabel} (paid it, so their own part)
                </p>
              )}
              {expense.payerUid === currentUserId && repaidNames.length > 0 && (
                <p className='text-muted-foreground text-right text-xs'>
                  Repaid so far: {repaidNames.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </>
    );
  };

  const renderExpenseRow = (expense: TripExpense) => {
    if (isSmallScreen) {
      const displayRange = getDisplayRange(expense);
      const hasEarly = Object.values(getEarlyPayments(expense)).some((payment) => !payment.isReturned);
      const myShare = totalsView === 'me' ? getMemberShareRange(expense, memberIds, currentUserId) : null;
      return (
        <li key={expense.id}>
          <Button
            type='button'
            variant='tertiary'
            aria-label={`Open details for ${expense.title}`}
            onClick={() => setDetailExpenseId(expense.id)}
            className='h-auto w-full justify-between gap-3 rounded-none px-0! py-3 text-left font-normal'
          >
            <span className='min-w-0 flex-1'>
              <span className='block truncate font-medium'>{expense.title}</span>
              <span className='text-muted-foreground line-clamp-2 block text-sm'>
                {getExpenseCategoryKeyLabel(getExpenseCategoryKey(expense))} ·{' '}
                {expense.status === 'PAID' ? getPayerLine(expense) : 'Expected'}
                {hasEarly ? ' · Paid early' : ''}
              </span>
            </span>
            <span className='max-w-32 shrink-0 text-right'>
              <span className='block font-medium'>{formatTotal(displayRange.min, displayRange.max, expense.currency)}</span>
              {myShare && (
                <span className='text-muted-foreground block text-xs'>
                  Mine {formatTotal(myShare.min, myShare.max, expense.currency)}
                </span>
              )}
              {!myShare && expense.isPerPerson && <span className='text-muted-foreground block text-xs'>per person</span>}
            </span>
            <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' aria-hidden='true' />
          </Button>
        </li>
      );
    }

    const actions = getActions(expense);
    return (
      <li key={expense.id} className='grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 py-3'>
        {renderExpenseDetail(expense)}
        {actions.length > 0 && (
          <div className='col-start-2 row-start-1 flex items-start gap-2 self-start'>
            {actions.map((action) => (
              <Button
                key={action.key}
                type='button'
                size='sm'
                variant='secondary'
                disabled={markingPaidId === expense.id}
                title={action.description}
                onClick={action.run}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </li>
    );
  };

  const detailExpense = expenses.find((expense) => expense.id === detailExpenseId);

  const renderClusters = (items: TripExpense[]) =>
    clusterByGroup(items).map((cluster, index) => {
      if (cluster.groupLabel === null) {
        return renderExpenseRow(cluster.items[0]);
      }

      const groupTotals = computeExpenseTotals(cluster.items, memberIds);

      return (
        <li key={`group-${cluster.groupLabel}-${index}`} className='py-3'>
          <div className='grid grid-cols-[1fr_auto] gap-x-3'>
            <div className='min-w-0'>
              <p className='text-sm font-medium'>{cluster.groupLabel}</p>
              <p className='text-muted-foreground text-xs'>
                {cluster.items.length} {cluster.items.length === 1 ? 'expense' : 'expenses'}
              </p>
            </div>
            <p className='text-muted-foreground max-w-32 pr-2 text-right text-sm'>
              {formatTotal(groupTotals.total.min, groupTotals.total.max, currency)}
            </p>
          </div>
          <ul className='divide-border border-border mt-1 ml-1 divide-y border-l pl-3'>
            {cluster.items.map(renderExpenseRow)}
          </ul>
        </li>
      );
    });

  const renderChipGroup = (
    label: string,
    options: { value: string; label: string }[],
    selected: string[],
    onChange: (values: string[]) => void,
  ) => (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-sm font-medium'>{label}</p>
      <MultiPillGroup
        label={`Filter by ${label.toLowerCase()}`}
        options={options}
        values={selected}
        onChange={onChange}
      />
    </div>
  );

  return (
    <section className='space-y-5 pt-4'>
      <SectionHeader
        title='Expenses'
        action={
          canAddExpenses && (
            <Button
              onClick={() => {
                setEditingExpense(null);
                setIsModalOpen(true);
              }}
            >
              Add
            </Button>
          )
        }
      />
      <div className='space-y-3'>
        <PillGroup
          label='Totals view'
          options={EXPENSE_TOTALS_VIEW_OPTIONS}
          value={totalsView}
          onChange={setTotalsView}
        />
        <p className='text-muted-foreground text-xs'>{EXPENSE_TOTALS_VIEW_HINTS[totalsView]}</p>
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
          {totalCards.map(({ label, total }) => (
            <div
              key={label}
              className={join(
                'border-border min-w-0 rounded-lg border p-3 text-center sm:text-left',
                (label === 'Total' || label === 'My total') && 'col-span-2 sm:col-span-1',
              )}
            >
              <p className='text-muted-foreground text-sm'>{label}</p>
              <p className='mt-1 text-base font-semibold text-balance sm:text-lg'>
                {formatTotal(total.min, total.max, currency)}
              </p>
            </div>
          ))}
        </div>
      </div>
      {totalsView === 'me' && myTotals.sentEarly > 0 && (
        <p className='text-muted-foreground -mt-2 text-sm'>
          You&apos;ve sent {formatTotal(myTotals.sentEarly, myTotals.sentEarly, currency)} early toward expected expenses.
        </p>
      )}
      <div className='border-border rounded-lg border'>
        <Disclosure
          label={
            <span className='text-sm font-medium'>
              Dues summary
              {myOpenPairs > 0 && (
                <span className='text-muted-foreground font-normal'>
                  {' '}
                  · {myOpenPairs} to settle
                </span>
              )}
            </span>
          }
          isOpen={isDuesOpen}
          onToggle={setIsDuesOpen}
          buttonClassName='px-3 py-2.5 hover:bg-muted/40'
          className='overflow-visible'
        >
          <div className='border-border border-t px-3 pb-3'>
          {pairSettlements.length === 0 ? (
            <p className='text-muted-foreground mt-1 text-sm'>
              Everyone&apos;s settled up.
            </p>
          ) : (
            <DuesSummary
              settlements={pairSettlements}
              currentUserId={currentUserId}
              memberLabel={memberLabel}
              formatAmount={(amount) => formatTotal(amount, amount, currency)}
              onToggleRepaid={(expenseId) =>
                void dispatch(toggleExpenseRepaid({ uid: currentUserId, tripId: trip.id, expenseId }))
              }
              onSetEarlyReturned={(expenseId, isReturned) =>
                void runAction(
                  dispatch(setEarlyPaymentReturned({ uid: currentUserId, tripId: trip.id, expenseId, isReturned })).unwrap(),
                  'Unable to update this early payment.',
                )
              }
              canRemoveEarly={(fromUid) => fromUid === currentUserId || canAddExpenses}
              onRemoveEarly={(expenseId, fromUid) => void handleRemoveEarlyFromDues(expenseId, fromUid)}
            />
          )}
          </div>
        </Disclosure>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='w-full min-w-0 sm:w-auto sm:flex-1'>
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
          className='min-w-0 flex-1 sm:w-44 sm:flex-none'
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
          className='relative shrink-0 mx-1 sm:mx-0'
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
        {isFilterDrawerOpen && (
          <div className='space-y-5'>
            <div className='divide-border divide-y'>
              <label className='flex items-center justify-between gap-4 py-2.5 text-sm'>
                Custom split only
                <AppToggle size='sm' checked={splitOnly} onCheckedChange={setSplitOnly} />
              </label>
              <label className='flex items-center justify-between gap-4 py-2.5 text-sm'>
                Estimated range only
                <AppToggle size='sm' checked={rangedOnly} onCheckedChange={setRangedOnly} />
              </label>
            </div>
            {renderChipGroup(
              'Status',
              (['PAID', 'EXPECTED'] as const).map((status) => ({
                value: status,
                label: status === 'PAID' ? 'Paid' : 'Expecting',
              })),
              statusFilter,
              (values) => setStatusFilter(values as ExpenseStatus[]),
            )}
            {renderChipGroup(
              'Category',
              categoryKeys.map((key) => ({ value: key, label: getExpenseCategoryKeyLabel(key) })),
              categoryFilter,
              setCategoryFilter,
            )}
            {renderChipGroup(
              'Day',
              [
                ...Array.from({ length: dayCount }, (_, index) => ({
                  value: String(index),
                  label: getDayLabel(trip.startDate, index, dayCount),
                })),
                { value: 'other', label: 'No specific day' },
              ],
              dayFilter,
              setDayFilter,
            )}
            {renderChipGroup(
              'Paid by',
              memberIds.map((uid) => ({ value: uid, label: memberLabel(uid) })),
              payerFilter,
              setPayerFilter,
            )}
          </div>
        )}
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
              {totalsView !== 'group' && (
                <span className='text-muted-foreground font-normal'>
                  {totalsView === 'me' ? ' your share' : ' per person'}
                </span>
              )}
            </p>
          </div>
          {dayGroups ? (
            dayGroups.map(({ bucket, items }, dayPosition) => (
              <div
                key={bucket}
                className='defer-offscreen space-y-3'
                style={{ '--defer-size': `${items.length * ESTIMATED_ROW_HEIGHT}px` } as CSSProperties}
              >
                <SectionDivider label={getBucketLabel(bucket, trip.startDate)} />
                <LazyMount eager={dayPosition < EAGER_DAYS} estimatedHeight={items.length * ESTIMATED_ROW_HEIGHT}>
                  <ul className='divide-border divide-y'>{renderClusters(items)}</ul>
                </LazyMount>
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
        currentUserId={currentUserId}
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
      {isSmallScreen && (
        <DetailSheet isOpen={detailExpense !== undefined} onClose={() => setDetailExpenseId(null)} title='Expense'>
          {detailExpense && (
            <div className='space-y-4'>
              <div className='grid grid-cols-[1fr_auto] gap-x-3 gap-y-2'>{renderExpenseDetail(detailExpense)}</div>
              {getActions(detailExpense).length > 0 && (
                <div className='border-border divide-border divide-y rounded-xl border'>
                  {getActions(detailExpense).map((action) => (
                    <Button
                      key={action.key}
                      type='button'
                      variant='tertiary'
                      className='h-auto w-full flex-col items-start gap-0 px-3 py-2.5 text-left font-normal'
                      onClick={() => {
                        setDetailExpenseId(null);
                        action.run();
                      }}
                    >
                      <span className='text-sm font-medium'>{action.label}</span>
                      <span className='text-muted-foreground text-xs'>{action.description}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DetailSheet>
      )}
      <EarlyPaymentModal
        key={`early-${earlyExpense?.id ?? 'none'}`}
        isOpen={earlyExpense !== null}
        trip={trip}
        expense={earlyExpense}
        currentUserId={currentUserId}
        formatAmount={(amount) => formatTotal(amount, amount, currency)}
        onSubmit={(values) => (earlyExpense ? handleSaveEarlyPayment(earlyExpense, values) : Promise.resolve())}
        onRemove={() => (earlyExpense ? handleRemoveEarlyPayment(earlyExpense) : Promise.resolve())}
        onClose={() => setEarlyExpense(null)}
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

export default memo(ExpensesSection);
