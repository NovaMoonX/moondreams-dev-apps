import { useState, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  CircleAlert,
  Layers,
  Repeat,
  ShoppingBag,
  Wallet,
} from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import EmptyCard from '@/components/EmptyCard';
import FloatingAction from '@/components/FloatingAction';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import RangeSlider from '@/components/RangeSlider';
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
  SPEND_FILTER_WORDS,
  SPEND_KINDS,
  SPEND_PERIODS,
  PAIR_WORDS,
  RULE_WORDS,
  RUNWAY_SEARCH_THRESHOLD,
  SPEND_WORDS,
} from '@apps/runway/constants';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import GroupsScreen from '@apps/runway/screens/spend/GroupsScreen';
import PurchaseScreen from '@apps/runway/screens/spend/PurchaseScreen';
import MoneyInSheet from '@apps/runway/components/MoneyInSheet';
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
  selectIsRulesLoaded,
  selectAccountPairs,
  selectAllCards,
  selectRules,
  selectRulesNeedingHome,
  selectMoneyIn,
  selectOnItsWay,
  selectSpendPurchases,
  selectWaitingBankMoves,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import {
  getPaidWithName,
  getPurchaseTitle,
} from '@apps/runway/utils/purchaseText';

type SpendKind = (typeof SPEND_KINDS)[number];
type AmountEnds = readonly [number, number];

const isCounted = (purchase: OpenPurchase) => purchase.lines.length > 0;

const fitsKind = (purchase: OpenPurchase, kind: SpendKind | null) => {
  if (kind === 'notCounted') return !isCounted(purchase);
  if (!isCounted(purchase)) return false;
  if (kind === 'purchases') return purchase.amountCents > 0;
  if (kind === 'moneyIn') return purchase.amountCents < 0;
  return true;
};

const CASH_SOURCE = 'cash';
const getSourceId = (purchase: OpenPurchase) =>
  purchase.paidByCardId ?? purchase.accountId ?? CASH_SOURCE;

const DOLLAR = 100;
/** The amount slider's top end: the largest amount in view, up to the next whole dollar. */
const getAmountTop = (purchases: readonly OpenPurchase[]) =>
  Math.max(
    DOLLAR,
    Math.ceil(
      purchases.reduce(
        (top, purchase) => Math.max(top, Math.abs(purchase.amountCents)),
        0,
      ) / DOLLAR,
    ) * DOLLAR,
  );

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

interface DoorButtonProps {
  icon: ReactNode;
  label: string;
  count: number;
  /** How many of them need the person, drawn in place of the count. */
  attention: number;
  attentionLabel: string;
  /** Below 360px a half door shows this instead of its label. */
  narrowLabel: string;
  isHalf: boolean;
  onClick: () => void;
}

/** A thin door above the purchase list: its icon and name, then how many it holds. */
function DoorButton({
  icon,
  label,
  narrowLabel,
  count,
  attention,
  attentionLabel,
  isHalf,
  onClick,
}: DoorButtonProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={onClick}
      className={join(
        'border-border text-foreground! h-10 min-w-0 flex-1 justify-between! rounded-xl border text-sm font-normal',
        isHalf ? 'gap-1.5 px-2.5!' : 'gap-2 px-3!',
      )}
    >
      <span className='text-muted-foreground flex min-w-0 items-center gap-2'>
        {icon}
        <span
          className={join(
            'text-foreground truncate',
            isHalf && 'max-[359px]:hidden',
          )}
        >
          {label}
        </span>
        {isHalf && (
          <span className='text-foreground truncate min-[360px]:hidden'>
            {narrowLabel}
          </span>
        )}
        {attention > 0 && <span className='sr-only'>, {attentionLabel}</span>}
      </span>
      {attention > 0 ? (
        <span
          aria-hidden='true'
          className='flex items-center gap-1 font-medium text-(--runway-warning-ink)'
        >
          <CircleAlert className='text-warning h-3.5 w-3.5' />
          {attention}
        </span>
      ) : (
        <span className='text-muted-foreground'>{count}</span>
      )}
    </Button>
  );
}

/** The purchases of the period in view, newest first. Search covers that period. */
function SpendScreen() {
  const isLoaded = useAppSelector(selectIsMovesLoaded);
  const allSpendPurchases = useAppSelector(selectSpendPurchases);
  const allMoneyIn = useAppSelector(selectMoneyIn);
  const allOnItsWay = useAppSelector(selectOnItsWay);
  const recentFrom = useAppSelector(selectRecentFrom);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const looks = useAppSelector(selectItemLooks);
  const { isHidden, isScrambled } = useValuesHidden();
  // A range would carry real cents into the address bar and to a screen reader.
  const isAmountShown = !isHidden && !isScrambled;
  const {
    spendEnvelope,
    showSpendEnvelope,
    spendKind,
    showSpendKind,
    spendFrom,
    showSpendFrom,
    spendMin,
    spendMax,
    showSpendAmount,
    openPurchase,
    purchaseId,
    closePurchase,
    spendPeriod,
    showSpendPeriod,
    isGroupsOpen,
    openGroups,
    closeGroups,
    openView,
  } = useRunwayUrlState();
  const pairCount =
    useAppSelector(selectAccountPairs).length +
    useAppSelector(selectWaitingBankMoves).length;
  const cards = useAppSelector(selectAllCards);
  const accounts = useAppSelector((state) => state.runway.accounts);
  const expenseCount = useAppSelector(selectExpenses).length;
  const level = useAppSelector(selectLevel);
  const ruleCount = useAppSelector(selectRules).length;
  const isRulesLoaded = useAppSelector(selectIsRulesLoaded);
  const today = todayAsUtcDate(useNow(60_000));
  const homelessCount = useAppSelector((state) =>
    selectRulesNeedingHome(state, today),
  ).length;
  const periodFor = useAppSelector((state) => state.runway.periodFor);
  const periodFailedFor = useAppSelector(
    (state) => state.runway.periodFailedFor,
  );

  const range = getSpendRange(spendPeriod, today);
  const isInRange = (purchase: OpenPurchase) =>
    purchase.date >= range.from && purchase.date < range.to;
  const purchases = allSpendPurchases.filter(isInRange);
  const moneyIn = allMoneyIn.filter(isInRange);
  const onItsWay = allOnItsWay.filter(({ purchase }) => isInRange(purchase));
  // A deposit waiting, on its way or linked to a pay is not in the purchase list, so its own sheet opens it.
  const openedDeposit =
    allMoneyIn.find(
      (purchase) =>
        purchase.id === purchaseId &&
        (purchase.needsHome || purchase.incomeDayId !== null),
    ) ??
    allOnItsWay.find(({ purchase }) => purchase.id === purchaseId)?.purchase ??
    null;
  const isPeriodReady =
    periodFor === range.key ||
    (recentFrom !== null && range.from >= recentFrom);
  const areDoorsReady = isLoaded && isPeriodReady && isRulesLoaded;
  const doors = !areDoorsReady
    ? []
    : [
        ...(expenseCount > 0
          ? [
              {
                id: 'groups',
                icon: <Layers className='h-4 w-4' aria-hidden='true' />,
                label: SPEND_WORDS.groups,
                shortLabel: SPEND_WORDS.groups,
                narrowLabel: SPEND_WORDS.groups,
                count: expenseCount,
                onClick: openGroups,
              },
            ]
          : []),
        ...(pairCount > 0
          ? [
              {
                id: 'accountMoves',
                icon: <ArrowLeftRight className='h-4 w-4' aria-hidden='true' />,
                label: PAIR_WORDS.doorTitle,
                shortLabel: PAIR_WORDS.doorShort,
                narrowLabel: PAIR_WORDS.doorNarrow,
                count: pairCount,
                onClick: () => openView('accountMoves'),
              },
            ]
          : []),
        ...(level === 'link'
          ? [
              {
                id: 'rules',
                icon: <Repeat className='h-4 w-4' aria-hidden='true' />,
                label: RULE_WORDS.doorLabel,
                shortLabel: RULE_WORDS.doorLabel,
                narrowLabel: RULE_WORDS.doorLabel,
                count: ruleCount,
                attention: homelessCount,
                attentionLabel: RULE_WORDS.doorNeedsHome(homelessCount),
                onClick: () => openView('rules'),
              },
            ]
          : []),
      ];
  const total = purchases
    .filter(isCounted)
    .reduce((sum, purchase) => sum + purchase.amountCents, 0);
  const moneyInTotal = moneyIn.reduce(
    (sum, purchase) => sum - purchase.amountCents,
    0,
  );
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(SPEND_PAGE_SIZE);
  const [formKey, setFormKey] = useState<number | null>(null);
  const [amountDraft, setAmountDraft] = useState<AmountEnds | null>(null);

  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const paidWithOf = (purchase: OpenPurchase) =>
    getPaidWithName(purchase, cards, accounts);
  const getEmptyWhere = (purchase: OpenPurchase) => {
    if (kindId !== 'moneyIn' || level !== 'link') return undefined;
    return purchase.incomeDayId !== null
      ? SPEND_FILTER_WORDS.toPay
      : SPEND_FILTER_WORDS.inFree;
  };
  const resetPaging = () => setShown(SPEND_PAGE_SIZE);

  const kindCounts = SPEND_KINDS.reduce<Record<SpendKind, number>>(
    (acc, kind) => ({
      ...acc,
      [kind]:
        kind === 'moneyIn'
          ? moneyIn.length
          : purchases.filter((purchase) => fitsKind(purchase, kind)).length,
    }),
    { purchases: 0, moneyIn: 0, notCounted: 0 },
  );
  // Purchases and Money in split by sign, so they wait until amounts show.
  const shownKinds = SPEND_KINDS.filter((kind) =>
    kind === 'notCounted' ? kindCounts.notCounted > 0 : !isHidden,
  );
  const kindId: SpendKind | null =
    spendKind !== null &&
    (kindCounts[spendKind] > 0 ||
      (spendKind === 'moneyIn' && onItsWay.length > 0)) &&
    shownKinds.includes(spendKind)
      ? spendKind
      : null;
  const ofKind =
    kindId === 'moneyIn'
      ? moneyIn
      : purchases.filter((purchase) => fitsKind(purchase, kindId));

  const sources = ofKind.reduce<Map<string, { name: string; count: number }>>(
    (acc, purchase) => {
      const id = getSourceId(purchase);
      const name = paidWithOf(purchase) ?? SPEND_WORDS.cashOrTyped;
      return acc.set(id, { name, count: (acc.get(id)?.count ?? 0) + 1 });
    },
    new Map(),
  );
  const sourceIds = spendFrom.filter((id) => sources.has(id));

  const counts = ofKind.reduce<Map<string, number>>((acc, purchase) => {
    new Set(purchase.lines.map((line) => line.envelopeId)).forEach((id) => {
      if (id !== null) acc.set(id, (acc.get(id) ?? 0) + 1);
    });
    return acc;
  }, new Map());
  const filterId =
    spendEnvelope !== null && counts.has(spendEnvelope) ? spendEnvelope : null;

  const amountTop = getAmountTop(ofKind);
  const low = spendMin !== null && spendMin < amountTop ? spendMin : 0;
  const committedAmount: AmountEnds = [
    low,
    Math.max(low, Math.min(spendMax ?? amountTop, amountTop)),
  ];
  const amount = amountDraft ?? committedAmount;
  const isAmountOn = isAmountShown && (amount[0] > 0 || amount[1] < amountTop);

  const showEnvelope = (envelopeId: string | null) => {
    showSpendEnvelope(envelopeId);
    resetPaging();
  };
  const showKind = (kind: SpendKind | null) => {
    showSpendKind(kind);
    showSpendAmount(null, null);
    resetPaging();
  };
  const showSources = (ids: string[]) => {
    showSpendFrom(ids);
    resetPaging();
  };
  const commitAmount = ([low, high]: AmountEnds) => {
    setAmountDraft(null);
    showSpendAmount(low > 0 ? low : null, high < amountTop ? high : null);
    resetPaging();
  };
  const clearFilters = () => {
    showSpendKind(null);
    showSpendFrom([]);
    showSpendEnvelope(null);
    showSpendAmount(null, null);
    resetPaging();
  };
  const removeFilter = (key: string) => {
    if (key === 'kind') showKind(null);
    if (key === 'from') showSources([]);
    if (key === 'envelope') showEnvelope(null);
    if (key === 'amount') commitAmount([0, amountTop]);
  };

  const hasBar =
    purchases.length >= RUNWAY_SEARCH_THRESHOLD ||
    kindCounts.notCounted > 0 ||
    kindCounts.moneyIn > 0 ||
    sources.size >= 2 ||
    counts.size >= 2;
  const needle = hasBar ? query.trim().toLowerCase() : '';
  const matches = ofKind.filter(
    (purchase) =>
      (filterId === null ||
        purchase.lines.some((line) => line.envelopeId === filterId)) &&
      (sourceIds.length === 0 || sourceIds.includes(getSourceId(purchase))) &&
      (!isAmountOn ||
        (Math.abs(purchase.amountCents) >= amount[0] &&
          Math.abs(purchase.amountCents) < amount[1] + DOLLAR)) &&
      (needle === '' ||
        `${getPurchaseTitle(purchase, nameOf, isHidden)} ${purchase.label ?? ''} ${purchase.merchant ?? ''} ${purchase.bankName ?? ''} ${purchase.note ?? ''} ${paidWithOf(purchase) ?? ''} ${purchase.lines.map((line) => (line.envelopeId === null ? SPEND_WORDS.freeToSpend : nameOf(line.envelopeId))).join(' ')} ${isHidden ? '' : formatCents(Math.abs(purchase.amountCents))}`
          .toLowerCase()
          .includes(needle)),
  );
  const showOnItsWay =
    kindId === 'moneyIn' &&
    onItsWay.length > 0 &&
    needle === '' &&
    sourceIds.length === 0 &&
    filterId === null &&
    !isAmountOn;
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

  const countedCount = purchases.length - kindCounts.notCounted;
  const kindOptions = [
    {
      value: '',
      label: SPEND_WORDS.all,
      detail: String(countedCount),
      ariaLabel: `${SPEND_WORDS.all}, ${countedCount}`,
    },
    ...shownKinds.map((kind) => ({
      value: kind as string,
      label: SPEND_FILTER_WORDS.kinds[kind],
      detail: String(kindCounts[kind]),
      ariaLabel: `${SPEND_FILTER_WORDS.kinds[kind]}, ${kindCounts[kind]}`,
    })),
  ];
  const sourceOptions = [...sources.entries()]
    .map(([id, { name, count }]) => ({
      value: id,
      label: name,
      detail: String(count),
      ariaLabel: `${name}, ${count}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const formatDollars = (cents: number) =>
    formatCents(cents).replace(/\.00$/, '');
  const activeFilters = [
    ...(kindId === null
      ? []
      : [{ key: 'kind', label: SPEND_FILTER_WORDS.kinds[kindId] }]),
    ...(sourceIds.length === 0
      ? []
      : [
          {
            key: 'from',
            label:
              sourceIds.length === 1
                ? (sources.get(sourceIds[0])?.name ??
                  SPEND_FILTER_WORDS.paidWith)
                : `${sources.get(sourceIds[0])?.name ?? SPEND_FILTER_WORDS.paidWith} and ${sourceIds.length - 1} more`,
          },
        ]),
    ...(filterId === null
      ? []
      : [{ key: 'envelope', label: nameOf(filterId) }]),
    ...(isAmountOn
      ? [
          {
            key: 'amount',
            label: SPEND_FILTER_WORDS.amountChip(
              formatDollars(amount[0]),
              formatDollars(amount[1]),
            ),
          },
        ]
      : []),
  ];
  const filterOptions = [
    {
      value: '',
      label: SPEND_WORDS.all,
      detail: String(ofKind.length),
      ariaLabel: `${SPEND_WORDS.all}, ${ofKind.length}`,
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
              {kindId === 'moneyIn'
                ? SPEND_FILTER_WORDS.cameIn
                : SPEND_PERIOD_WORDS.total}
            </p>
            <p className='text-3xl font-semibold tracking-tight tabular-nums'>
              <SensitiveValue>
                {kindId === 'moneyIn'
                  ? `+${formatCents(moneyInTotal)}`
                  : formatCents(total)}
              </SensitiveValue>
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
            filterLabel={SPEND_FILTER_WORDS.label}
            activeFilters={activeFilters}
            onRemoveFilter={removeFilter}
            onClearFilters={clearFilters}
            doneLabel={SPEND_FILTER_WORDS.show(matches.length)}
            compactDoneLabel={SPEND_FILTER_WORDS.showShort(matches.length)}
          >
            {shownKinds.length > 0 && (
              <FilterSection title={SPEND_FILTER_WORDS.kind}>
                <PillGroup
                  label={SPEND_FILTER_WORDS.kind}
                  options={kindOptions}
                  value={kindId ?? ''}
                  onChange={(value) =>
                    showKind(value === '' ? null : (value as SpendKind))
                  }
                />
                {kindId === 'notCounted' && (
                  <p className='text-muted-foreground text-xs'>
                    {SPEND_FILTER_WORDS.notCountedHelp}
                  </p>
                )}
                {kindId === 'moneyIn' && (
                  <p className='text-muted-foreground text-xs'>
                    {SPEND_FILTER_WORDS.moneyInHelp}
                  </p>
                )}
              </FilterSection>
            )}
            {sources.size >= 2 && (
              <FilterSection title={SPEND_FILTER_WORDS.paidWith}>
                <MultiPillGroup
                  label={SPEND_FILTER_WORDS.paidWith}
                  options={sourceOptions}
                  values={sourceIds}
                  onChange={showSources}
                />
              </FilterSection>
            )}
            {isAmountShown && ofKind.length >= 2 && (
              <FilterSection title={SPEND_FILTER_WORDS.amount}>
                <div className='flex justify-between text-sm tabular-nums'>
                  <span>{formatDollars(amount[0])}</span>
                  <span>{formatDollars(amount[1])}</span>
                </div>
                <RangeSlider
                  label={SPEND_FILTER_WORDS.amountLabel}
                  handleLabels={[
                    SPEND_FILTER_WORDS.minLabel,
                    SPEND_FILTER_WORDS.maxLabel,
                  ]}
                  min={0}
                  max={amountTop}
                  step={DOLLAR}
                  value={amount}
                  onChange={setAmountDraft}
                  onCommit={commitAmount}
                  formatValue={formatDollars}
                  className='-mx-3'
                />
              </FilterSection>
            )}
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
        {doors.length > 0 && (
          <div className='space-y-2'>
            {Array.from({ length: Math.ceil(doors.length / 2) }, (_, row) =>
              doors.slice(row * 2, row * 2 + 2),
            ).map((row) => (
              <div key={row[0].id} className='flex gap-2'>
                {row.map((door) => (
                  <DoorButton
                    key={door.id}
                    icon={door.icon}
                    label={row.length > 1 ? door.shortLabel : door.label}
                    narrowLabel={door.narrowLabel}
                    count={door.count}
                    attention={door.attention ?? 0}
                    attentionLabel={door.attentionLabel ?? ''}
                    isHalf={row.length > 1}
                    onClick={door.onClick}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
        {showOnItsWay && (
          <div className='space-y-2'>
            <SectionDivider label={SPEND_FILTER_WORDS.onItsWay} />
            <p className='text-muted-foreground text-sm'>
              {SPEND_FILTER_WORDS.onItsWayIntro}
            </p>
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {onItsWay.map(({ purchase, heldBy }) => (
                <PurchaseRow
                  key={purchase.id}
                  purchase={purchase}
                  looks={looks}
                  paidWith={paidWithOf(purchase)}
                  emptyWhere={
                    heldBy === null
                      ? SPEND_FILTER_WORDS.onItsWayPending
                      : SPEND_FILTER_WORDS.waitingFor(
                          paidWithOf(heldBy) ?? SPEND_FILTER_WORDS.otherAccount,
                        )
                  }
                  onOpen={() => openPurchase(purchase.id)}
                />
              ))}
            </ul>
          </div>
        )}
        {matches.length === 0 && showOnItsWay ? null : matches.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {ofKind.length === 0 && kindId === null
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
                    paidWith={paidWithOf(purchase)}
                    emptyWhere={getEmptyWhere(purchase)}
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
      {openedDeposit !== null && (
        <MoneyInSheet
          key={openedDeposit.id}
          purchase={openedDeposit}
          onClose={closePurchase}
        />
      )}
      {purchaseId !== null && openedDeposit === null && (
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
