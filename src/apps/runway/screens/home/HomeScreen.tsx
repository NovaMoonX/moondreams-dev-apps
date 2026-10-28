import { ChevronRight, Home } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { BillCoverageLine } from '@apps/runway/components/CoverageHeadline';
import EnvelopeTile from '@apps/runway/components/EnvelopeTile';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import { HOME_ENVELOPE_TILES, HOME_WORDS } from '@apps/runway/constants';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  selectBalances,
  selectBillCoverage,
} from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectBills,
  selectEnvelopes,
  selectIsDaysLoaded,
  selectIsMovesLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectListedDays,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeFreeToSpend } from '@apps/runway/utils/balanceText';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

function HomeScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isItemsLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const isDaysLoaded = useAppSelector(selectIsDaysLoaded);
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const isLoaded = isItemsLoaded && isDaysLoaded;
  const hasIncome = useAppSelector((state) =>
    state.runway.items.some(
      (item) => item.kind === 'payLine' && item.archivedAt === null,
    ),
  );
  const balances = useAppSelector(selectBalances);
  const coverage = useAppSelector((state) => selectBillCoverage(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const { open } = useAppSelector((state) => selectListedDays(state, today));
  const { openView, openDay, showTab, showPlanSection } = useRunwayUrlState();

  if (!isLoaded) {
    return <p className='text-muted-foreground text-sm'>Getting your plan.</p>;
  }

  if (hasIncome && !isLedgerReady) {
    return <p className='text-muted-foreground text-sm'>Getting your plan.</p>;
  }

  if (!hasIncome) {
    return (
      <EmptyCard
        icon={<Home className='h-5 w-5' />}
        action={
          <Button size='sm' onClick={() => openView('start')}>
            {HOME_WORDS.getStarted}
          </Button>
        }
      >
        {HOME_WORDS.noIncome}
      </EmptyCard>
    );
  }

  const free = describeFreeToSpend(getFreeToSpendFigure(balances));
  const gapName =
    coverage.kind === 'gap'
      ? (bills.find(({ item }) => item.id === coverage.billId)?.version.payload
          .name ?? null)
      : null;
  const nextDay = open.find((day) => day.status !== 'notArrived') ?? null;
  const shown = envelopes.slice(0, HOME_ENVELOPE_TILES);

  return (
    <div className='space-y-5'>
      <div className='space-y-2'>
        <Button
          variant='tertiary'
          className='border-border bg-accent h-auto w-full items-start justify-between gap-3 rounded-2xl border p-4 text-left font-normal whitespace-normal'
          aria-label={`${free.label}, ${free.value}. See it in detail`}
          onClick={() => openView('freeToSpend')}
        >
          <span className='min-w-0'>
            <span className='text-muted-foreground block text-sm font-medium'>
              {free.label}
            </span>
            <span className='block text-3xl font-semibold tracking-tight tabular-nums'>
              {free.value}
            </span>
          </span>
          <ChevronRight
            className='text-muted-foreground mt-1 h-5 w-5 shrink-0'
            aria-hidden='true'
          />
        </Button>
        <BillCoverageLine coverage={coverage} gapName={gapName} />
      </div>
      {nextDay && (
        <div className='space-y-2'>
          <SectionHeader title={HOME_WORDS.nextIncome} />
          <ul>
            <IncomeDayCard
              day={nextDay}
              onOpen={() => openDay(nextDay.dayKey)}
            />
          </ul>
        </div>
      )}
      {envelopes.length > 0 && (
        <div className='space-y-2'>
          <SectionHeader title={HOME_WORDS.envelopes} />
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {shown.map(({ item, version }) => (
              <EnvelopeTile
                key={item.id}
                name={version.payload.name}
                emoji={version.payload.emoji}
                cents={balances.assignedByItem[item.id] ?? 0}
              />
            ))}
          </ul>
          {envelopes.length > shown.length && (
            <Button
              variant='tertiary'
              className='h-10 justify-start px-0!'
              onClick={() => {
                showPlanSection('envelopes');
                showTab('plan');
              }}
            >
              See all {envelopes.length} envelopes
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default HomeScreen;
