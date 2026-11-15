import { Input } from '@moondreamsdev/dreamer-ui/components';

import Pill from '@/components/Pill';
import { formatDayRun, toDayRuns } from '@/utils/dayRunUtils';
import { MAX_ANOTHER_DAY_NOTE_LENGTH } from '@apps/going-once/constants';
import type { DaysAnswer } from '@apps/going-once/utils/pickupDays';

const chipFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: 'UTC',
});

const formatChip = (day: number) =>
  `${chipFormatter.format(new Date(day))} ${new Date(day).getUTCDate()}`;

interface PickupDaysQuestionProps {
  /** The sale's days that haven't passed. */
  openDays: number[];
  answer: DaysAnswer;
  onChange: (answer: DaysAnswer) => void;
}

/** Which pickup days work for the buyer: every day, a whole stretch, single days, or none of them and when they could come instead. */
function PickupDaysQuestion({
  openDays,
  answer,
  onChange,
}: PickupDaysQuestionProps) {
  const runs = toDayRuns(openDays);
  const picked = new Set(answer.days);
  const isAll = openDays.every((day) => picked.has(day));
  const pickDays = (days: number[]) =>
    onChange({
      ...answer,
      days: openDays.filter((day) => days.includes(day)),
      needsAnotherDay: false,
    });
  const toggleDay = (day: number) =>
    pickDays(
      picked.has(day)
        ? answer.days.filter((kept) => kept !== day)
        : [...answer.days, day],
    );
  const toggleRun = (run: number[]) => {
    const isRunPicked = run.every((day) => picked.has(day));
    pickDays(
      isRunPicked
        ? answer.days.filter((day) => !run.includes(day))
        : [...answer.days, ...run],
    );
  };

  return (
    <div className='space-y-3'>
      <div className='space-y-1'>
        <p className='font-medium'>Which days work for you?</p>
        <p className='text-muted-foreground text-sm text-pretty'>
          Pick every day you could pick it up.
        </p>
      </div>
      {openDays.length > 1 && (
        <Pill
          isSelected={isAll}
          onClick={() => pickDays(isAll ? [] : openDays)}
        >
          All of them
        </Pill>
      )}
      {runs.map((run) => (
        <div key={run[0]} className='space-y-2'>
          <p className='text-muted-foreground text-xs font-medium'>
            {formatDayRun(run)}
          </p>
          <div className='flex flex-wrap gap-2'>
            {run.length > 1 && (
              <Pill
                isSelected={run.every((day) => picked.has(day))}
                ariaLabel={`All of ${formatDayRun(run)}`}
                onClick={() => toggleRun(run)}
              >
                All {run.length} days
              </Pill>
            )}
            {run.map((day) => (
              <Pill
                key={day}
                isSelected={picked.has(day)}
                ariaLabel={formatDayRun([day])}
                onClick={() => toggleDay(day)}
              >
                {formatChip(day)}
              </Pill>
            ))}
          </div>
        </div>
      ))}
      <Pill
        isSelected={answer.needsAnotherDay}
        onClick={() =>
          onChange({
            ...answer,
            days: [],
            needsAnotherDay: !answer.needsAnotherDay,
          })
        }
      >
        None of these, I&apos;d need another day
      </Pill>
      {answer.needsAnotherDay && (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-sm'>
            When could you come? (optional)
          </p>
          <Input
            aria-label='When could you come?'
            placeholder='Weekday evenings after 6'
            value={answer.note}
            maxLength={MAX_ANOTHER_DAY_NOTE_LENGTH}
            onChange={(event) =>
              onChange({ ...answer, note: event.target.value })
            }
          />
        </div>
      )}
    </div>
  );
}

export default PickupDaysQuestion;
