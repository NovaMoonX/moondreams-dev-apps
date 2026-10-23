import { useState } from 'react';
import { CalendarDays } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SectionHeader from '@/components/SectionHeader';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { COMING_DAYS_PREVIEW } from '@apps/runway/constants';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import IncomeForm from '@apps/runway/forms/IncomeForm';
import {
  selectComingDays,
  selectIsPlanItemsLoaded,
} from '@apps/runway/store/selectors/runwaySelectors';

function DaysScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const days = useAppSelector((state) => selectComingDays(state, today));
  const { openDay } = useRunwayUrlState();
  const [isExpanded, setIsExpanded] = useState(false);
  const [formKey, setFormKey] = useState<number | null>(null);

  const hasFold = days.length > COMING_DAYS_PREVIEW + 3;
  const visibleDays =
    hasFold && !isExpanded ? days.slice(0, COMING_DAYS_PREVIEW) : days;

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>
          Getting your income days.
        </p>
      );
    }
    if (days.length === 0) {
      return (
        <EmptyCard icon={<CalendarDays className='h-5 w-5' />}>
          Your coming income days will be listed here once you add an income
          source.
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-2'>
        <ul className='space-y-2'>
          {visibleDays.map((day) => (
            <IncomeDayCard
              key={day.dayKey}
              day={day}
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
        <IncomeForm
          key={formKey}
          isOpen
          title='Expected'
          defaultFrequency='once'
          onClose={() => setFormKey(null)}
        />
      )}
    </div>
  );
}

export default DaysScreen;
