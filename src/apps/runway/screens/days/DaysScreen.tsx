import { useState } from 'react';
import { CalendarDays, CalendarPlus } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import HelpTip from '@/components/HelpTip';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import {
  COMING_DAYS_CAP,
  COMING_DAYS_PREVIEW,
  DAYS_WORDS,
  PROBLEM_WORDS,
  SETTLED_DAYS_PREVIEW,
} from '@apps/runway/constants';
import { HoldsThroughLine } from '@apps/runway/components/CoverageHeadline';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useDeferredLookahead } from '@apps/runway/useDeferredLookahead';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import ExpectedScreen from '@apps/runway/screens/days/ExpectedScreen';
import {
  selectRangeSides,
  selectStanceCushion,
} from '@apps/runway/store/selectors/lookaheadSelectors';
import {
  selectHasEverHadIncome,
  selectIsDaysLoaded,
  selectIsMovesLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectListedDays,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeRangeBasis } from '@apps/runway/utils/rangeText';

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

function DaysScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isPlanLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const isDaysLoaded = useAppSelector(selectIsDaysLoaded);
  const isLoaded = isPlanLoaded && isDaysLoaded;
  const hasIncome = useAppSelector(selectHasEverHadIncome);
  const { open: allDays, confirmed } = useAppSelector((state) =>
    selectListedDays(state, today),
  );
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const lookahead = useDeferredLookahead(
    today,
    isLoaded && isLedgerReady && allDays.length > 0,
  );
  const cushion = useAppSelector((state) => selectStanceCushion(state, today));
  const rangeSides = useAppSelector((state) => selectRangeSides(state, today));
  const stance = useAppSelector(selectStance);
  const days = allDays.slice(0, COMING_DAYS_CAP);
  const cushionParts = cushion
    ? [
        cushion.sourceCount > 0 && plural(cushion.sourceCount, 'source'),
        cushion.billCount > 0 && plural(cushion.billCount, 'bill'),
      ].filter(Boolean)
    : [];
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
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {visibleDays.map((day) => (
                <IncomeDayCard
                  key={day.dayKey}
                  day={day}
                  note={
                    lookahead?.shortByDay[day.dayKey]
                      ? `The plan leaves ${lookahead.shortByDay[day.dayKey].name} ${formatCentsShort(lookahead.shortByDay[day.dayKey].shortBy)} short`
                      : undefined
                  }
                  isPrivate
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
                days. Later ones appear as these pass.
              </p>
            )}
          </div>
        )}
        {confirmed.length > 0 && (
          <div className='space-y-2'>
            <SectionDivider label='Confirmed' />
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {visibleSettled.map((day) => (
                <IncomeDayCard
                  key={day.dayKey}
                  day={day}
                  isConfirmedShown={false}
                  isPrivate
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
      <div className='flex items-center justify-between gap-2'>
        <div className='min-w-0 flex-1'>
          {lookahead && days.length > 0 && (
            <HoldsThroughLine
              lookahead={lookahead}
              help={
                (cushion || rangeSides.income || rangeSides.expense) && (
                  <HelpTip title={PROBLEM_WORDS.stanceTitle}>
                    {cushion && (
                      <p>
                        Conservative planning is holding back{' '}
                        {formatCents(cushion.cents)}
                        {cushionParts.length > 0 &&
                          ` across ${cushionParts.join(' and ')}`}
                        .
                      </p>
                    )}
                    {(rangeSides.income || rangeSides.expense) && (
                      <p>{describeRangeBasis(stance, rangeSides)}</p>
                    )}
                  </HelpTip>
                )
              }
            />
          )}
        </div>
        {hasIncome && (
          <Button
            variant='secondary'
            size='sm'
            className="relative shrink-0 gap-1.5 before:absolute before:-inset-2 before:content-['']"
            aria-label={DAYS_WORDS.addExpected}
            onClick={() => setFormKey((current) => (current ?? 0) + 1)}
          >
            <CalendarPlus
              className='h-4 w-4 max-[389px]:hidden'
              aria-hidden='true'
            />
            <span className='min-[390px]:hidden'>
              {DAYS_WORDS.addExpectedShort}
            </span>
            <span className='max-[389px]:hidden'>{DAYS_WORDS.addExpected}</span>
          </Button>
        )}
      </div>
      {getBody()}
      {formKey !== null && (
        <ExpectedScreen key={formKey} onClose={() => setFormKey(null)} />
      )}
    </div>
  );
}

export default DaysScreen;
