import { useState } from 'react';
import { ChevronRight, Home, ListChecks, ShoppingBag } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import FloatingAction from '@/components/FloatingAction';
import HelpTip from '@/components/HelpTip';
import SensitiveValue from '@/components/SensitiveValue';
import SectionHeader from '@/components/SectionHeader';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { HoldsThroughLine } from '@apps/runway/components/CoverageHeadline';
import DueBillsCard from '@apps/runway/components/DueBillsCard';
import LevelGate from '@apps/runway/components/LevelGate';
import EnvelopeTile from '@apps/runway/components/EnvelopeTile';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import LookaheadWarnings from '@apps/runway/components/LookaheadWarnings';
import {
  CARD_DUE_WARN_DAYS,
  HOME_TILE_COUNT,
  HOME_WORDS,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import { getDueCards } from '@apps/runway/engine/cards';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import DraftPickUpRow from '@apps/runway/components/DraftPickUpRow';
import HomeCards from '@apps/runway/screens/home/HomeCards';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { getListedCards } from '@apps/runway/utils/cardText';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectRangeSides } from '@apps/runway/store/selectors/lookaheadSelectors';
import {
  selectAllCards,
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
  const allCards = useAppSelector(selectAllCards);
  const isTrack = useAppSelector((state) => selectLevel(state) === 'track');
  const moves = useAppSelector((state) => state.runway.moves);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? 0,
  );
  const [isAddingPurchase, setIsAddingPurchase] = useState(false);
  const { isHidden } = useValuesHidden();
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
          <Button onClick={() => openView('start')}>
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
  const hasMoney = ({ item }: (typeof envelopes)[number]) =>
    (balances.assignedByItem[item.id] ?? 0) !== 0;
  const shown = [
    ...envelopes.filter(hasMoney),
    ...envelopes.filter((entry) => !hasMoney(entry)),
  ].slice(0, HOME_TILE_COUNT);
  const dueCards = isTrack
    ? getDueCards(
        getListedCards(allCards, balances.reserveByCard),
        balances.reserveByCard,
        moves,
        today,
        CARD_DUE_WARN_DAYS,
        startDate,
      )
    : [];
  const hasRanges = rangeSides.income || rangeSides.expense;

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        {dueCards.length > 0 ||
        (lookahead !== null &&
          lookahead.problems.length + lookahead.undated.length > 0) ? (
          <LookaheadWarnings lookahead={lookahead} dueCards={dueCards} />
        ) : lookahead ? (
          <HoldsThroughLine lookahead={lookahead} />
        ) : (
          <div className='min-h-10' aria-hidden='true' />
        )}
        <div className='border-border bg-accent relative rounded-2xl border px-4 py-2.5'>
          <div className='flex h-5 items-center gap-1'>
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
            aria-label={
              isHidden
                ? `${free.label}, amount hidden. See it in detail`
                : `${free.label}, ${free.value}. See it in detail`
            }
            onClick={() => openView('freeToSpend')}
          >
            <span className='min-w-0 text-4xl leading-none font-semibold tracking-tight break-words tabular-nums'>
              <SensitiveValue>{free.value}</SensitiveValue>
            </span>
            <ChevronRight
              className='text-muted-foreground h-5 w-5 shrink-0'
              aria-hidden='true'
            />
          </Button>
        </div>
      </div>
      <DueBillsCard lookahead={lookahead} today={today} />
      {!isAddingPurchase && (
        <DraftPickUpRow
          isTrack={isTrack}
          onPickUpPurchase={() => setIsAddingPurchase(true)}
        />
      )}
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
      <LevelGate level='track'>
        <HomeCards today={today} />
      </LevelGate>
      {envelopes.length > 0 && (
        <div className='space-y-2'>
          <SectionHeader
            title={HOME_WORDS.envelopes}
            action={
              envelopes.length > shown.length && (
                <ShowMoreButton
                  isHeaderAction
                  onClick={() => {
                    showPlanSection('envelopes');
                    showTab('plan');
                  }}
                >
                  See all
                </ShowMoreButton>
              )
            }
          />
          <ul className='grid grid-cols-2 gap-2'>
            {shown.map(({ item, version }) => (
              <EnvelopeTile
                key={item.id}
                itemId={item.id}
                envelope={version.payload}
                cents={balances.assignedByItem[item.id] ?? 0}
                pairedNote={describePairedBy(pairedBy[item.id] ?? [])}
                today={today}
                look='tile'
              />
            ))}
          </ul>
        </div>
      )}
      {nextDay && (
        <div className='space-y-2'>
          <SectionHeader title={HOME_WORDS.nextIncome} />
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            <IncomeDayCard
              day={nextDay}
              onOpen={() => openDay(nextDay.dayKey)}
            />
          </ul>
        </div>
      )}
      {envelopes.length > 0 && (
        <LevelGate level='track'>
          <FloatingAction
            label={SPEND_WORDS.newPurchase}
            icon={<ShoppingBag className='h-5 w-5' aria-hidden='true' />}
            onClick={() => setIsAddingPurchase(true)}
          />
        </LevelGate>
      )}
      {isAddingPurchase && (
        <PurchaseForm isOpen onClose={() => setIsAddingPurchase(false)} />
      )}
    </div>
  );
}

export default HomeScreen;
