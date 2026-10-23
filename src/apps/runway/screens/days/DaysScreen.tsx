import { useState } from 'react';
import { CalendarDays } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import {
  COMING_DAYS_CAP,
  COMING_DAYS_PREVIEW,
  SETTLED_DAYS_PREVIEW,
} from '@apps/runway/constants';
import { HoldsThroughLine } from '@apps/runway/components/CoverageHeadline';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import LookaheadWarnings from '@apps/runway/components/LookaheadWarnings';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import ExpectedScreen from '@apps/runway/screens/days/ExpectedScreen';
import {
  selectLookahead,
  selectRangeSides,
  selectStanceCushion,
} from '@apps/runway/store/selectors/lookaheadSelectors';
import {
  selectIsDaysLoaded,
  selectIsMovesLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectListedDays,
} from '@apps/runway/store/selectors/runwaySelectors';

function DaysScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isPlanLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const isDaysLoaded = useAppSelector(selectIsDaysLoaded);
  const isLoaded = isPlanLoaded && isDaysLoaded;
  const { open: allDays, confirmed } = useAppSelector((state) =>
    selectListedDays(state, today),
  );
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const lookahead = useAppSelector((state) =>
    isLoaded && isLedgerReady && allDays.length > 0
      ? selectLookahead(state, today)
      : null,
  );
  const cushion = useAppSelector((state) => selectStanceCushion(state, today));
  const rangeSides = useAppSelector((state) => selectRangeSides(state, today));
  const days = allDays.slice(0, COMING_DAYS_CAP);
  const { openDay } = useRunwayUrlState();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSettledExpanded, setIsSettledExpanded] = useState(false);
  const [formKey, setFormKey] = useState<number | null>(null);

  const hasFold = days.length > COMING_DAYS_PREVIEW + 3;
  const visibleDays =
    hasFold && !isExpanded ? days.slice(0, COMING_DAYS_PREVIEW) : days;

  const hasSettledFold = confirmed.length > SETTLED_DAYS_PREVIEW + 3;
  const visibleSettled =
    hasSettledFold && !isSettledExpanded
      ? confirmed.slice(0, SETTLED_DAYS_PREVIEW)
      : confirmed;

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>
          Getting your income days.
        </p>
      );
    }
    if (days.length === 0 && confirmed.length === 0) {
      return (
        <EmptyCard icon={<CalendarDays className='h-5 w-5' />}>
          Your coming income days will be listed here once you add an income
          source.
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-4'>
        {days.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            No income days are coming up.
          </p>
        ) : (
          <div className='space-y-2'>
            {lookahead && (
              <div className='space-y-2'>
                <HoldsThroughLine
                  lookahead={lookahead}
                  rangeSides={rangeSides}
                />
                <LookaheadWarnings lookahead={lookahead} cushion={cushion} />
              </div>
            )}
            <ul className='space-y-2'>
              {visibleDays.map((day) => (
                <IncomeDayCard
                  key={day.dayKey}
                  day={day}
                  note={
                    lookahead?.shortByDay[day.dayKey]
                      ? `Runs short on ${lookahead.shortByDay[day.dayKey].name}`
                      : undefined
                  }
                  onOpen={() => openDay(day.dayKey)}
                />
              ))}
            </ul>
            {hasFold && (
              <ShowMoreButton
                isOpen={isExpanded}
                onClick={() => setIsExpanded((open) => !open)}
              >
                {isExpanded
                  ? 'Show fewer'
                  : `Show ${days.length - COMING_DAYS_PREVIEW} more`}
              </ShowMoreButton>
            )}
            {allDays.length > COMING_DAYS_CAP && (
              <p className='text-muted-foreground text-sm'>
                Showing the next {COMING_DAYS_CAP} of {allDays.length} income
                days.
              </p>
            )}
          </div>
        )}
        {confirmed.length > 0 && (
          <div className='space-y-2'>
            <SectionDivider label='Confirmed' />
            <ul className='space-y-2'>
              {visibleSettled.map((day) => (
                <IncomeDayCard
                  key={day.dayKey}
                  day={day}
                  onOpen={() => openDay(day.dayKey)}
                />
              ))}
            </ul>
            {hasSettledFold && (
              <ShowMoreButton
                isOpen={isSettledExpanded}
                onClick={() => setIsSettledExpanded((open) => !open)}
              >
                {isSettledExpanded
                  ? 'Show fewer'
                  : `Show ${confirmed.length - SETTLED_DAYS_PREVIEW} earlier`}
              </ShowMoreButton>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Coming income'
        action={
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setFormKey((current) => (current ?? 0) + 1)}
          >
            + Expected
          </Button>
        }
      />
      {getBody()}
      {formKey !== null && (
        <ExpectedScreen key={formKey} onClose={() => setFormKey(null)} />
      )}
    </div>
  );
}

export default DaysScreen;
