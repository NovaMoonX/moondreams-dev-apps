import { Input } from '@moondreamsdev/dreamer-ui/components';

import { toDateInputValue } from '@/utils/dateInputUtils';
import type { CostStepValues } from '@apps/a-list/utils/costStep';
import { evaluateCostStep } from '@apps/a-list/utils/costStep';
import { getMembershipAgeLabel } from '@apps/a-list/utils/membershipAge';

interface StartDateStepProps {
  values: CostStepValues;
  todayDay: number;
  onChange: (values: CostStepValues) => void;
}

function StartDateStep({ values, todayDay, onChange }: StartDateStepProps) {
  const { errors, startDate } = evaluateCostStep(values, todayDay);
  const ageLabel =
    startDate !== null && !errors.startDate
      ? getMembershipAgeLabel(startDate, todayDay)
      : null;
  const isToday = startDate === todayDay;

  return (
    <div className='space-y-5 text-center'>
      <div className='space-y-2'>
        <p className='text-5xl' aria-hidden='true'>
          📆
        </p>
        <h3 className='text-xl font-semibold'>
          When did your membership start?
        </h3>
        <p className='text-muted-foreground text-sm'>
          Your first billing day. Every month since then counts toward what
          you've spent.
        </p>
      </div>
      <div className='mx-auto max-w-xs text-left'>
        <Input
          type='date'
          variant='outline'
          rounded='full'
          aria-label='Membership start date'
          max={toDateInputValue(todayDay)}
          value={values.startDate}
          errorMessage={errors.startDate}
          onChange={(event) =>
            onChange({ ...values, startDate: event.target.value })
          }
        />
      </div>
      {(ageLabel || isToday) && (
        <p className='bg-accent text-accent-foreground mx-auto w-fit rounded-full px-4 py-1.5 text-sm font-medium'>
          {isToday
            ? "🎉 You're brand new. Welcome to the club!"
            : `🎉 You've been a member for ${ageLabel}.`}
        </p>
      )}
    </div>
  );
}

export default StartDateStep;
