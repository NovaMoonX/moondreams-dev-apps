import { useState } from 'react';
import { CalendarRange, ShoppingBag, Wallet } from 'lucide-react';

import { Select } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import FloatingAction from '@/components/FloatingAction';
import { PillGroup } from '@/components/PillGroup';
import SensitiveValue from '@/components/SensitiveValue';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import SummaryEditor from '@/components/SummaryEditor';
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
  SPEND_PILL_LIMIT,
  SPEND_SEARCH_THRESHOLD,
  SPEND_WORDS,
} from '@apps/runway/constants';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
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
  selectItemLooks,
  selectIsMovesLoaded,
  selectSpendPurchases,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { getPurchaseTitle } from '@apps/runway/utils/purchaseText';

const ALL_ENVELOPES = 'all';

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

/** What was spent since the newest closing, newest first; earlier purchases are counted in the figures and arrive with the history view. Search covers the window in view. */
function SpendScreen() {
  const isLoaded = useAppSelector(selectIsMovesLoaded);
  const allSpendPurchases = useAppSelector(selectSpendPurchases);
  const recentFrom = useAppSelector(selectRecentFrom);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const looks = useAppSelector(selectItemLooks);
  const {
    spendEnvelope,
    showSpendEnvelope,
    openPurchase,
    purchaseId,
    closePurchase,
    spendPeriod,
    showSpendPeriod,
  } = useRunwayUrlState();
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
  const needle =
    purchases.length >= SPEND_SEARCH_THRESHOLD
      ? query.trim().toLowerCase()
      : '';
  const matches = purchases.filter(
    (purchase) =>
      (filterId === null ||
        purchase.lines.some((line) => line.envelopeId === filterId)) &&
      (needle === '' ||
        `${getPurchaseTitle(purchase, nameOf)} ${purchase.merchant ?? ''} ${purchase.note ?? ''} ${purchase.lines.map((line) => (line.envelopeId === null ? SPEND_WORDS.freeToSpend : nameOf(line.envelopeId))).join(' ')} ${formatCents(Math.abs(purchase.amountCents))}`
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
    if (allSpendPurchases.length === 0 && purchases.length === 0 && isRecent) {
      return (
        <EmptyCard icon={<Wallet className='h-5 w-5' />}>
          {SPEND_WORDS.empty}
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-4'>
        <div className='space-y-3'>
          <SummaryEditor
            label={SPEND_PERIOD_WORDS.period}
            summary={periodLabel}
            placeholder=''
            title={SPEND_PERIOD_WORDS.period}
            icon={<CalendarRange />}
            isFramed
            shouldFocus={false}
          >
            <PillGroup
              label={SPEND_PERIOD_WORDS.period}
              options={periodOptions}
              value={isQuickPeriod ? spendPeriod : null}
              onChange={showSpendPeriod}
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
                  onChange={showSpendPeriod}
                />
              </div>
            )}
          </SummaryEditor>
          <div>
            <p className='text-muted-foreground text-xs'>
              {SPEND_PERIOD_WORDS.total}
            </p>
            <p className='text-3xl font-semibold tracking-tight tabular-nums'>
              <SensitiveValue>{formatCents(total)}</SensitiveValue>
            </p>
          </div>
        </div>
        {purchases.length >= SPEND_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={(text) => {
              setQuery(text);
              setShown(SPEND_PAGE_SIZE);
            }}
            placeholder={SPEND_WORDS.search}
          />
        )}
        {filterOptions.length > SPEND_PILL_LIMIT && (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>
              {SPEND_WORDS.envelope}
            </p>
            <Select
              searchable
              options={filterOptions.map((option) => ({
                text: `${option.label} · ${option.detail}`,
                value: option.value === '' ? ALL_ENVELOPES : option.value,
              }))}
              value={filterId ?? ALL_ENVELOPES}
              onChange={(value) => {
                showSpendEnvelope(value === ALL_ENVELOPES ? null : value);
                setShown(SPEND_PAGE_SIZE);
              }}
            />
          </div>
        )}
        {counts.size >= 2 && filterOptions.length <= SPEND_PILL_LIMIT && (
          <PillGroup
            isThin
            label='Envelope'
            options={filterOptions}
            value={filterId ?? ''}
            onChange={(value) => {
              showSpendEnvelope(value === '' ? null : value);
              setShown(SPEND_PAGE_SIZE);
            }}
          />
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
      <SectionHeader title={SPEND_WORDS.title} />
      {getBody()}
      <FloatingAction
        label={SPEND_WORDS.newPurchase}
        icon={<ShoppingBag className='h-5 w-5' aria-hidden='true' />}
        onClick={() => setFormKey((current) => (current ?? 0) + 1)}
      />
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
