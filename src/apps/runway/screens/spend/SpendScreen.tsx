import { useState } from 'react';
import { ChevronRight, Layers, ShoppingBag, Wallet } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import FloatingAction from '@/components/FloatingAction';
import { PillGroup } from '@/components/PillGroup';
import SensitiveValue from '@/components/SensitiveValue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import FilterBar, { FilterSection } from '@/components/FilterBar';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import ScopeChip from '@/components/ScopeChip';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import PurchaseRow from '@apps/runway/components/PurchaseRow';
import {
  DEFAULT_SPEND_PERIOD,
  SPEND_PAGE_SIZE,
  SPEND_PERIOD_LABELS,
  SPEND_PERIOD_WORDS,
  SPEND_PERIODS,
  RUNWAY_SEARCH_THRESHOLD,
  SPEND_WORDS,
} from '@apps/runway/constants';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import GroupsScreen from '@apps/runway/screens/spend/GroupsScreen';
import PurchaseScreen from '@apps/runway/screens/spend/PurchaseScreen';
import { selectRecentFrom } from '@apps/runway/store/selectors/historySelectors';
import {
  getMonthStart,
  getPreviousMonth,
  listMonths,
  toMonthKey,
} from '@apps/runway/engine/closings';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getSpendRange } from '@apps/runway/utils/spendPeriod';
import { useNow } from '@/hooks/useNow';
import {
  selectExpenses,
  selectItemLooks,
  selectIsMovesLoaded,
  selectSpendPurchases,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { getPurchaseTitle } from '@apps/runway/utils/purchaseText';

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Groups newest-first purchases under the month they happened in. */
const groupByMonth = (purchases: readonly OpenPurchase[]) =>
  purchases.reduce<{ label: string; rows: OpenPurchase[] }[]>((groups, row) => {
    const label = monthFormat.format(row.date);
    const last = groups.at(-1);
    return last && last.label === label
      ? [...groups.slice(0, -1), { label, rows: [...last.rows, row] }]
      : [...groups, { label, rows: [row] }];
  }, []);

/** The purchases of the period in view, newest first. Search covers that period. */
function SpendScreen() {
  const isLoaded = useAppSelector(selectIsMovesLoaded);
  const allSpendPurchases = useAppSelector(selectSpendPurchases);
  const recentFrom = useAppSelector(selectRecentFrom);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const looks = useAppSelector(selectItemLooks);
  const { isHidden } = useValuesHidden();
  const {
    spendEnvelope,
    showSpendEnvelope,
    openPurchase,
    purchaseId,
    closePurchase,
    spendPeriod,
    showSpendPeriod,
    isGroupsOpen,
    openGroups,
    closeGroups,
  } = useRunwayUrlState();
  const expenseCount = useAppSelector(selectExpenses).length;
  const today = todayAsUtcDate(useNow(60_000));
  const periodFor = useAppSelector((state) => state.runway.periodFor);
  const periodFailedFor = useAppSelector(
    (state) => state.runway.periodFailedFor,
  );

  const range = getSpendRange(spendPeriod, today);
  const purchases = allSpendPurchases.filter(
    (purchase) => purchase.date >= range.from && purchase.date < range.to,
  );
  const isPeriodReady =
    periodFor === range.key ||
    (recentFrom !== null && range.from >= recentFrom);
  const total = purchases.reduce(
    (sum, purchase) => sum + purchase.amountCents,
    0,
  );
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(SPEND_PAGE_SIZE);
  const [formKey, setFormKey] = useState<number | null>(null);

  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const counts = purchases.reduce<Map<string, number>>((acc, purchase) => {
    new Set(purchase.lines.map((line) => line.envelopeId)).forEach((id) => {
      if (id !== null) acc.set(id, (acc.get(id) ?? 0) + 1);
    });
    return acc;
  }, new Map());
  const filterId =
    spendEnvelope !== null && counts.has(spendEnvelope) ? spendEnvelope : null;
  const showEnvelope = (envelopeId: string | null) => {
    showSpendEnvelope(envelopeId);
    setShown(SPEND_PAGE_SIZE);
  };
  const hasBar =
    purchases.length >= RUNWAY_SEARCH_THRESHOLD || counts.size >= 2;
  const needle = hasBar ? query.trim().toLowerCase() : '';
  const matches = purchases.filter(
    (purchase) =>
      (filterId === null ||
        purchase.lines.some((line) => line.envelopeId === filterId)) &&
      (needle === '' ||
        `${getPurchaseTitle(purchase, nameOf, isHidden)} ${purchase.label ?? ''} ${purchase.merchant ?? ''} ${purchase.note ?? ''} ${purchase.lines.map((line) => (line.envelopeId === null ? SPEND_WORDS.freeToSpend : nameOf(line.envelopeId))).join(' ')} ${isHidden ? '' : formatCents(Math.abs(purchase.amountCents))}`
          .toLowerCase()
          .includes(needle)),
  );
  const visible = matches.slice(0, shown);
  const groups = groupByMonth(visible);
  const isRecent = spendPeriod === DEFAULT_SPEND_PERIOD;
  const currentMonth = toMonthKey(today);
  const startMonth = toMonthKey(startDate ?? today - 365 * 86_400_000);
  const isQuickPeriod = (SPEND_PERIODS as readonly string[]).includes(
    spendPeriod,
  );
  const olderChoices = listMonths(startMonth, getPreviousMonth(currentMonth))
    .reverse()
    .slice(0, 120)
    .filter(
      (month) =>
        month === spendPeriod ||
        recentFrom === null ||
        getMonthStart(month) < recentFrom ||
        allSpendPurchases.some(
          (purchase) => toMonthKey(purchase.date) === month,
        ),
    );
  const periodLabel = isQuickPeriod
    ? SPEND_PERIOD_LABELS[spendPeriod as keyof typeof SPEND_PERIOD_LABELS]
    : monthFormat.format(range.from);
  const periodOptions = SPEND_PERIODS.map((value) => ({
    value: value as string,
    label: SPEND_PERIOD_LABELS[value],
  }));
  const monthOptions = olderChoices.map((month) => ({
    value: month,
    label: monthFormat.format(getMonthStart(month)),
  }));

  const filterOptions = [
    {
      value: '',
      label: SPEND_WORDS.all,
      detail: String(purchases.length),
      ariaLabel: `${SPEND_WORDS.all}, ${purchases.length}`,
    },
    ...[...counts.entries()]
      .map(([id, count]) => ({
        value: id,
        label: nameOf(id),
        detail: String(count),
        ariaLabel: `${nameOf(id)}, ${count}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  const isFirstRun =
    allSpendPurchases.length === 0 && purchases.length === 0 && isRecent;
  const periodChip =
    isLoaded && !isFirstRun ? (
      <ScopeChip label={periodLabel} title={SPEND_PERIOD_WORDS.period}>
        {(close) => (
          <>
            <PillGroup
              label={SPEND_PERIOD_WORDS.period}
              options={periodOptions}
              value={isQuickPeriod ? spendPeriod : null}
              onChange={(value) => {
                showSpendPeriod(value);
                close();
              }}
            />
            {monthOptions.length > 0 && (
              <div className='space-y-1.5'>
                <p className='text-muted-foreground text-xs'>
                  {SPEND_PERIOD_WORDS.months}
                </p>
                <PillGroup
                  label={SPEND_PERIOD_WORDS.months}
                  options={monthOptions}
                  value={isQuickPeriod ? null : spendPeriod}
                  onChange={(value) => {
                    showSpendPeriod(value);
                    close();
                  }}
                />
              </div>
            )}
          </>
        )}
      </ScopeChip>
    ) : null;

  const getBody = () => {
    if (periodFailedFor === range.key && !isPeriodReady) {
      return (
        <p className='text-muted-foreground text-sm'>
          {SPEND_PERIOD_WORDS.failed}
        </p>
      );
    }
    if (!isLoaded || !isPeriodReady) {
      return (
        <p className='text-muted-foreground text-sm'>{SPEND_WORDS.loading}</p>
      );
    }
    if (isFirstRun) {
      return (
        <EmptyCard icon={<Wallet className='h-5 w-5' />}>
          {SPEND_WORDS.empty}
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-4'>
        <div className='space-y-3'>
          <div>
            <p className='text-muted-foreground text-xs'>
              {SPEND_PERIOD_WORDS.total}
            </p>
            <p className='text-3xl font-semibold tracking-tight tabular-nums'>
              <SensitiveValue>{formatCents(total)}</SensitiveValue>
            </p>
          </div>
        </div>
        {hasBar && (
          <FilterBar
            query={query}
            onQueryChange={(text) => {
              setQuery(text);
              setShown(SPEND_PAGE_SIZE);
            }}
            searchPlaceholder={
              isQuickPeriod ? SPEND_WORDS.search : `Search ${periodLabel}`
            }
            filterLabel='Filter purchases'
            activeFilters={
              filterId === null
                ? []
                : [{ key: 'envelope', label: nameOf(filterId) }]
            }
            onRemoveFilter={() => showEnvelope(null)}
            onClearFilters={() => showEnvelope(null)}
            doneLabel={`Show ${matches.length} ${matches.length === 1 ? 'purchase' : 'purchases'}`}
            compactDoneLabel={`Show ${matches.length}`}
          >
            {counts.size >= 2 && (
              <FilterSection title={SPEND_WORDS.envelope}>
                <PillGroup
                  label={SPEND_WORDS.envelope}
                  options={filterOptions}
                  value={filterId ?? ''}
                  onChange={(value) =>
                    showEnvelope(value === '' ? null : value)
                  }
                />
              </FilterSection>
            )}
          </FilterBar>
        )}
        {expenseCount > 0 && (
          <Button
            type='button'
            variant='tertiary'
            onClick={openGroups}
            className='border-border text-foreground! h-10 w-full justify-between! gap-2 rounded-xl border px-3! text-sm font-normal'
          >
            <span className='flex items-center gap-2'>
              <Layers
                className='text-muted-foreground h-4 w-4'
                aria-hidden='true'
              />
              {SPEND_WORDS.groups}
            </span>
            <span className='text-muted-foreground flex items-center gap-1'>
              {expenseCount}
              <ChevronRight className='h-4 w-4' aria-hidden='true' />
            </span>
          </Button>
        )}
        {matches.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {purchases.length === 0
              ? SPEND_PERIOD_WORDS.emptyPeriod
              : SPEND_WORDS.noMatch}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className='space-y-2'>
              <SectionDivider label={group.label} />
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {group.rows.map((purchase) => (
                  <PurchaseRow
                    key={purchase.id}
                    purchase={purchase}
                    looks={looks}
                    onOpen={() => openPurchase(purchase.id)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
        {matches.length > visible.length && (
          <ShowMoreButton
            onClick={() => setShown((current) => current + SPEND_PAGE_SIZE)}
          >
            Show {Math.min(SPEND_PAGE_SIZE, matches.length - visible.length)}{' '}
            more
          </ShowMoreButton>
        )}
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader title={SPEND_WORDS.title} action={periodChip} />
      {getBody()}
      <FloatingAction
        label={SPEND_WORDS.newPurchase}
        icon={<ShoppingBag className='h-5 w-5' aria-hidden='true' />}
        onClick={() => setFormKey((current) => (current ?? 0) + 1)}
      />
      {isGroupsOpen && <GroupsScreen onClose={closeGroups} />}
      {purchaseId !== null && (
        <PurchaseScreen
          key={purchaseId}
          purchaseId={purchaseId}
          onClose={closePurchase}
        />
      )}
      {formKey !== null && (
        <PurchaseForm
          key={formKey}
          isOpen
          presetEnvelopeId={filterId}
          onClose={() => setFormKey(null)}
        />
      )}
    </div>
  );
}

export default SpendScreen;
