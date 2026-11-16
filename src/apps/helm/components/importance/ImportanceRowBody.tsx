import { CalendarCheck, Folder, Target } from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useHabitListLine } from '@apps/helm/components/habits/useHabitListLine';
import { useHabitWhoName } from '@apps/helm/components/habits/useHabitWhoName';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import EvidenceLine from '@apps/helm/components/projects/EvidenceLine';
import GoalEvidenceLine from '@apps/helm/components/projects/GoalEvidenceLine';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenHabit, OpenProject } from '@apps/helm/types';
import { formatWeekdayDayUTC } from '@apps/helm/utils/taskDue';

export type ImportanceRecord =
  | { kind: 'project'; project: OpenProject }
  | { kind: 'habit'; habit: OpenHabit };

const pausedLine = (until: number | null) =>
  until === null
    ? HELM_COPY.habitsPausedOpen
    : HELM_COPY.habitsPausedUntil(formatWeekdayDayUTC(until));

function HabitMeta({ habit }: { habit: OpenHabit }) {
  const readLine = useHabitListLine();
  const whoName = useHabitWhoName(habit);
  const line = readLine(habit);
  return (
    <span className='text-muted-foreground block text-[13px] break-words'>
      {whoName === null
        ? line
        : `${HELM_COPY.habitForWho(whoName)}\u00a0· ${line}`}
    </span>
  );
}

interface ImportanceRowBodyProps {
  record: ImportanceRecord;
  isPaused: boolean;
  isTinted?: boolean;
}

/** One thing's row in the order: its emoji or kind mark, its name and the one line its own list shows (or when it is paused until). */
function ImportanceRowBody({
  record,
  isPaused,
  isTinted = false,
}: ImportanceRowBodyProps) {
  const thing = record.kind === 'habit' ? record.habit : record.project;
  const id = thing.id;
  const mark =
    thing.emoji ??
    (record.kind === 'habit' ? (
      <CalendarCheck className='text-muted-foreground mx-auto size-5' />
    ) : record.project.kind === 'goal' ? (
      <Target className='text-muted-foreground mx-auto size-5' />
    ) : (
      <Folder className='text-muted-foreground mx-auto size-5' />
    ));
  return (
    <span
      data-importance-row={id}
      className={join(
        'flex min-w-0 items-center gap-3 rounded-lg',
        isTinted && 'bg-secondary -mx-2 px-2 py-1',
      )}
    >
      <span className='w-7 shrink-0 text-center text-2xl' aria-hidden='true'>
        {mark}
      </span>
      <span className='min-w-0 flex-1'>
        <PrivateTitle
          kind={record.kind}
          record={thing}
          className='text-foreground text-[15px] leading-[21px] font-medium'
        >
          {thing.name}
        </PrivateTitle>
        {isPaused ? (
          <span className='text-muted-foreground block text-[13px]'>
            {pausedLine(thing.pausedUntil)}
          </span>
        ) : record.kind === 'habit' ? (
          <HabitMeta habit={record.habit} />
        ) : (
          <span className='block'>
            {record.project.kind === 'goal' ? (
              <GoalEvidenceLine projectId={id} />
            ) : (
              <EvidenceLine project={record.project} />
            )}
          </span>
        )}
      </span>
    </span>
  );
}

export default ImportanceRowBody;
