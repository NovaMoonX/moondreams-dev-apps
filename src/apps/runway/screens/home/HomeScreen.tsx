import { useState } from 'react';
import { ChevronRight, Home, ListChecks } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import EmptyCard from '@/components/EmptyCard';
import HelpTip from '@/components/HelpTip';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { HoldsThroughLine } from '@apps/runway/components/CoverageHeadline';
import LevelGate from '@apps/runway/components/LevelGate';
import EnvelopeTile from '@apps/runway/components/EnvelopeTile';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import LookaheadWarnings from '@apps/runway/components/LookaheadWarnings';
import {
  HOME_ENVELOPE_TILES,
  HOME_TILE_COUNT,
  HOME_WORDS,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectRangeSides } from '@apps/runway/store/selectors/lookaheadSelectors';
import {
  selectBills,
  selectHasIncome,
  selectEnvelopes,
  selectGoals,
  selectIsDaysLoaded,
  selectIsMovesLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectListedDays,
  selectPairedBy,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeFreeToSpend } from '@apps/runway/utils/balanceText';
import { describePairedBy } from '@apps/runway/utils/fundingText';
import { describeRangeBasis } from '@apps/runway/utils/rangeText';
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
  const hasIncome = useAppSelector((state) => selectHasIncome(state, today));
  const isSetupOpen = useAppSelector(
    (state) =>
      selectBills(state, today).length === 0 &&
      selectEnvelopes(state, today).length === 0 &&
      selectGoals(state, today).length === 0 &&
      state.runway.plan?.startDate == null,
  );
  const balances = useAppSelector(selectBalances);
  const lookahead = useDeferredLookahead(today, isLedgerReady);
  const rangeSides = useAppSelector((state) => selectRangeSides(state, today));
  const stance = useAppSelector(selectStance);
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const pairedBy = useAppSelector((state) => selectPairedBy(state, today));
  const { open } = useAppSelector((state) => selectListedDays(state, today));
  const [isAddingPurchase, setIsAddingPurchase] = useState(false);
  const level = useAppSelector(selectLevel);
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
  const nextDay = open.find((day) => day.status !== 'notArrived') ?? null;
  const withMoney = envelopes.filter(
    ({ item }) =>
      level !== 'plan' || (balances.assignedByItem[item.id] ?? 0) !== 0,
  );
  const shown = (withMoney.length > 0 ? withMoney : envelopes).slice(
    0,
    withMoney.length > 0
      ? level === 'track'
        ? HOME_TILE_COUNT
        : HOME_ENVELOPE_TILES
      : 3,
  );
  const hasRanges = rangeSides.income || rangeSides.expense;
  const isTiles = level === 'track';

  return (
    <div className='space-y-4'>
      {lookahead ? (
        <HoldsThroughLine lookahead={lookahead} />
      ) : (
        <div className='min-h-10' aria-hidden='true' />
      )}
      <div className='border-border bg-accent relative rounded-2xl border p-4 sm:max-w-md'>
        <div className='flex h-6 items-center gap-1'>
          <span className='text-muted-foreground text-sm font-medium'>
            {free.label}
          </span>
          {hasRanges && (
            <span className='relative z-10'>
              <HelpTip title={HOME_WORDS.freeToSpend}>
                {describeRangeBasis(stance, rangeSides)}
              </HelpTip>
            </span>
          )}
        </div>
        <Button
          variant='tertiary'
          size='stripped'
          className="text-foreground! static h-auto w-full items-center justify-between gap-3 text-left font-normal after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          aria-label={`${free.label}, ${free.value}. See it in detail`}
          onClick={() => openView('freeToSpend')}
        >
          <span className='min-w-0 text-4xl font-semibold tracking-tight break-words tabular-nums'>
            {free.value}
          </span>
          <ChevronRight
            className='text-muted-foreground h-5 w-5 shrink-0'
            aria-hidden='true'
          />
        </Button>
      </div>
      {lookahead && <LookaheadWarnings lookahead={lookahead} />}
      {isSetupOpen && (
        <EmptyCard
          icon={<ListChecks className='h-5 w-5' />}
          action={
            <Button size='sm' onClick={() => openView('start')}>
              {HOME_WORDS.resumeAction}
            </Button>
          }
        >
          {HOME_WORDS.resume}
        </EmptyCard>
      )}
      {nextDay && (
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          <IncomeDayCard
            day={nextDay}
            lead={HOME_WORDS.nextIncome}
            onOpen={() => openDay(nextDay.dayKey)}
          />
        </ul>
      )}
      {envelopes.length > 0 && (
        <div className='space-y-2'>
          <SectionHeader
            title={HOME_WORDS.envelopes}
            action={
              <LevelGate level='track'>
                <Button
                  variant='secondary'
                  size='sm'
                  onClick={() => setIsAddingPurchase(true)}
                >
                  + {SPEND_WORDS.envelopeAdd}
                </Button>
              </LevelGate>
            }
          />
          <ul
            className={join(
              isTiles
                ? 'grid grid-cols-2 gap-2'
                : 'border-border divide-border bg-card divide-y rounded-2xl border',
            )}
          >
            {shown.map(({ item, version }) => (
              <EnvelopeTile
                key={item.id}
                itemId={item.id}
                envelope={version.payload}
                cents={balances.assignedByItem[item.id] ?? 0}
                pairedNote={describePairedBy(pairedBy[item.id] ?? [])}
                today={today}
                look={isTiles ? 'tile' : 'row'}
              />
            ))}
          </ul>
          {envelopes.length > shown.length && (
            <Button
              variant='tertiary'
              className='h-10 gap-1 px-0!'
              onClick={() => {
                showPlanSection('envelopes');
                showTab('plan');
              }}
            >
              See all {envelopes.length} envelopes
              <ChevronRight className='h-4 w-4' aria-hidden='true' />
            </Button>
          )}
        </div>
      )}
      {isAddingPurchase && (
        <PurchaseForm isOpen onClose={() => setIsAddingPurchase(false)} />
      )}
    </div>
  );
}

export default HomeScreen;
