import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarCheck, Plus } from 'lucide-react';

import TickMark from '@/components/TickMark';
import { useHabitWhoName } from '@apps/helm/components/habits/useHabitWhoName';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import { HELM_COPY } from '@apps/helm/constants';
import type { HabitLine as HabitLineModel } from '@apps/helm/utils/habitToday';
import { formatClock } from '@apps/helm/utils/planDays';

interface HabitLineProps {
  line: HabitLineModel;
  timeZone: string;
  onCheck: (line: HabitLineModel, status: 'done' | 'skipped') => void;
  onUndoCheck: (line: HabitLineModel) => void;
  onTally: (line: HabitLineModel) => void;
  onUndoTally: (line: HabitLineModel) => void;
  onOpen: (habitId: string) => void;
}

const TRAILING =
  "relative shrink-0 text-muted-foreground after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']";

const readTitle = (line: HabitLineModel) => {
  const { name } = line.habit;
  if (line.kind === 'tally') {
    return HELM_COPY.habitLineCount(
      name,
      line.count,
      line.habit.timesPerDay ?? 0,
    );
  }
  return name;
};

const toSentenceStart = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const readState = (line: HabitLineModel, timeZone: string) => {
  if (line.kind === 'tally') {
    return line.count > 0 && line.lastAt !== null
      ? HELM_COPY.habitLastAt(formatClock(line.lastAt, timeZone))
      : HELM_COPY.habitMetaThroughDay;
  }
  if (line.state === 'done' && line.check) {
    return HELM_COPY.habitDoneAt(formatClock(line.check.at, timeZone));
  }
  if (line.state === 'skipped') return HELM_COPY.habitSkippedLine;
  if (line.startAt === null || line.endAt === null) {
    return HELM_COPY.habitMetaThroughDay;
  }
  if (line.state === 'ended') {
    return HELM_COPY.habitMetaEnded(formatClock(line.endAt, timeZone));
  }
  if (line.state === 'open') {
    return HELM_COPY.habitMetaUntil(formatClock(line.endAt, timeZone));
  }
  return formatClock(line.startAt, timeZone);
};

const readMeta = (
  line: HabitLineModel,
  timeZone: string,
  whoName: string | null,
) =>
  [
    whoName === null ? null : HELM_COPY.habitForWho(whoName),
    line.kind === 'tick' && line.label ? toSentenceStart(line.label) : null,
    readState(line, timeZone),
  ]
    .filter((part): part is string => part !== null)
    .join('\u00a0· ');

/** A habit due today as a bare 44px line, never a card: a tick (or a "+" for a counted one), its name and part of the day, one muted meta, and the Undo of what was just done or a Skip. A window that passed stays, muted and still tickable. */
function HabitLine({
  line,
  timeZone,
  onCheck,
  onUndoCheck,
  onTally,
  onUndoTally,
  onOpen,
}: HabitLineProps) {
  const { habit } = line;
  const whoName = useHabitWhoName(habit);
  const isTally = line.kind === 'tally';
  const isMarked = line.kind === 'tick' && line.state === 'done';
  const isSkipped = line.kind === 'tick' && line.state === 'skipped';
  const isQuiet = line.kind === 'tick' && line.state === 'ended';
  const hasUndo = isTally ? line.count > 0 : isMarked || isSkipped;
  const canSkip = line.kind === 'tick' && !isMarked && !isSkipped;

  const tap = () => {
    if (line.kind === 'tally') return onTally(line);
    if (isMarked || isSkipped) return onUndoCheck(line);
    onCheck(line, 'done');
  };

  return (
    <div className='flex min-h-11 items-center gap-4 px-1'>
      <Button
        type='button'
        variant='tertiary'
        rounded='full'
        className={join(
          "relative size-6 min-h-0 min-w-0 shrink-0 border-2 p-0! after:absolute after:-inset-2.5 after:content-['']",
          isMarked
            ? 'border-transparent'
            : 'border-muted-foreground/60 bg-transparent',
        )}
        aria-label={
          isTally
            ? HELM_COPY.habitAddOne(habit.name)
            : isMarked
              ? HELM_COPY.habitMarkNotDone(habit.name)
              : HELM_COPY.habitMarkDone(habit.name)
        }
        onClick={tap}
      >
        {isMarked && <TickMark className='size-6' />}
        {isTally && (
          <Plus className='text-muted-foreground size-3.5' aria-hidden='true' />
        )}
      </Button>
      <Button
        type='button'
        variant='tertiary'
        className='flex h-auto min-h-11 min-w-0 flex-1 items-center justify-start gap-2 rounded-none border-0 p-0 text-left focus-visible:-outline-offset-2'
        onClick={() => onOpen(habit.id)}
      >
        <span
          className='w-5 shrink-0 text-center text-[17px]'
          aria-hidden='true'
        >
          {habit.emoji ?? (
            <CalendarCheck className='text-muted-foreground mx-auto size-4' />
          )}
        </span>
        <span className='min-w-0 flex-1'>
          <PrivateTitle
            kind='habit'
            record={habit}
            className={join(
              'text-[15px] leading-5',
              isQuiet || isSkipped
                ? 'text-muted-foreground'
                : 'text-foreground',
            )}
          >
            {readTitle(line)}
          </PrivateTitle>
          <span className='text-muted-foreground block text-[13px] leading-[18px] break-words'>
            {readMeta(line, timeZone, whoName)}
          </span>
        </span>
      </Button>
      {hasUndo && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className={TRAILING}
          onClick={() => (isTally ? onUndoTally(line) : onUndoCheck(line))}
        >
          {HELM_COPY.habitUndo}
        </Button>
      )}
      {canSkip && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className={TRAILING}
          aria-label={HELM_COPY.habitSkipLabel(habit.name)}
          onClick={() => onCheck(line, 'skipped')}
        >
          {HELM_COPY.habitSkip}
        </Button>
      )}
    </div>
  );
}

export default HabitLine;
