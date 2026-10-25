import { ChevronRight, Home } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { HoldsThroughLine } from '@apps/runway/components/CoverageHeadline';
import LevelGate from '@apps/runway/components/LevelGate';
import EnvelopeTile from '@apps/runway/components/EnvelopeTile';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import {
  CHECK_WORDS,
  HOME_ENVELOPE_TILES,
  HOME_WORDS,
} from '@apps/runway/constants';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectRangeSides } from '@apps/runway/store/selectors/lookaheadSelectors';
import {
  selectEnvelopes,
  selectIsDaysLoaded,
  selectIsMovesLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectListedDays,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeFreeToSpend } from '@apps/runway/utils/balanceText';
import { useDeferredLookahead } from '@apps/runway/useDeferredLookahead';
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
      (item) =>
        item.kind === 'payLine' &&
        item.archivedAt === null &&
        (item.endedAt === null || item.endedAt >= today),
    ),
  );
  const balances = useAppSelector(selectBalances);
  const lookahead = useDeferredLookahead(today, isLedgerReady);
  const rangeSides = useAppSelector((state) => selectRangeSides(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const { open } = useAppSelector((state) => selectListedDays(state, today));
  const { openView, openDay, showTab, showPlanSection, openCheckAmount } =
    useRunwayUrlState();

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
        {lookahead ? (
          <HoldsThroughLine
            lookahead={lookahead}
            rangeSides={rangeSides}
            isFirstProblemShown
          />
        ) : (
          <div className='min-h-5' aria-hidden='true' />
        )}
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
          <LevelGate level='track'>
            <Button
              variant='secondary'
              size='sm'
              className='h-10'
              onClick={() => openCheckAmount(null)}
            >
              {CHECK_WORDS.open}
            </Button>
          </LevelGate>
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
