import { useState } from 'react';
import { Banknote } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { SCHEDULE_LABELS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import IncomeForm from '@apps/runway/forms/IncomeForm';
import {
  selectIsPlanItemsLoaded,
  selectResolvedPlan,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { PayLineSealed, Schedule } from '@apps/runway/types';

const ordinalRules = new Intl.PluralRules('en-US', { type: 'ordinal' });
const ORDINAL_SUFFIXES: Record<string, string> = {
  one: 'st',
  two: 'nd',
  few: 'rd',
  other: 'th',
};
const toOrdinal = (day: number) =>
  `${day}${ORDINAL_SUFFIXES[ordinalRules.select(day)]}`;

const describePattern = (schedule: Schedule) => {
  if (schedule.kind === 'monthly') {
    return `Monthly, the ${toOrdinal(schedule.monthDays[0])}`;
  }
  if (schedule.kind === 'twiceMonthly') {
    return `Twice a month, the ${schedule.monthDays.map(toOrdinal).join(' and ')}`;
  }
  return SCHEDULE_LABELS[schedule.kind];
};

const describeTiming = ({ schedule, ending }: PayLineSealed) => {
  if (schedule.kind === 'once' && schedule.anchor !== null) {
    return `Arrives ${formatDateUTC(schedule.anchor)}`;
  }
  const pattern = describePattern(schedule);
  if (ending.afterCount !== null)
    return `${pattern} · Ends after ${ending.afterCount} payments`;
  if (ending.onDate !== null)
    return `${pattern} · Ends ${formatDateUTC(ending.onDate)}`;
  return pattern;
};

function IncomeScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const sources = useAppSelector((state) => selectResolvedPlan(state, today));
  const [formKey, setFormKey] = useState<number | null>(null);

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>Getting your income.</p>
      );
    }
    if (sources.length === 0) {
      return (
        <EmptyCard icon={<Banknote className='h-5 w-5' />}>
          Start with where your money comes from. Each pay you add shows up as a
          coming day on Days.
        </EmptyCard>
      );
    }
    return (
      <ul className='space-y-3'>
        {sources.map((source) => (
          <li
            key={source.item.id}
            className='border-border bg-card rounded-2xl border p-4'
          >
            <h3 className='line-clamp-2 font-medium break-words'>
              {source.version.payload.name}
            </h3>
            {source.payLines.length === 0 ? (
              <p className='text-muted-foreground mt-1 text-sm'>
                No pay added yet.
              </p>
            ) : (
              <ul className='divide-border mt-2 divide-y'>
                {source.payLines.map(({ item, version }) => {
                  return (
                    <li
                      key={item.id}
                      className='space-y-0.5 py-2 first:pt-0 last:pb-0'
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <p className='min-w-0 break-words'>
                          {version.payload.name}
                        </p>
                        <p className='shrink-0 font-semibold whitespace-nowrap tabular-nums'>
                          {formatCents(version.payload.amount.lowCents)}
                        </p>
                      </div>
                      <p className='text-muted-foreground text-sm'>
                        {describeTiming(version.payload)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Income'
        action={
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setFormKey((current) => (current ?? 0) + 1)}
          >
            + Add income
          </Button>
        }
      />
      {getBody()}
      {formKey !== null && (
        <IncomeForm
          key={formKey}
          isOpen
          title='Income'
          defaultFrequency={null}
          onClose={() => setFormKey(null)}
        />
      )}
    </div>
  );
}

export default IncomeScreen;
