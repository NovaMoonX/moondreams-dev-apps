import { useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { CalendarDays } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import TickMark from '@/components/TickMark';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { useFetchedTasks } from '@apps/helm/hooks/useFetchedTasks';
import { bringToToday } from '@apps/helm/store/actions/planActions';
import { selectOpenTasksById } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenTask } from '@apps/helm/types';
import { formatSlotRange, shiftDayKey } from '@apps/helm/utils/planDays';
import type { PlanSources } from '@apps/helm/utils/planInput';

interface PastDayProps {
  dayKey: string;
  sources: PlanSources;
}

const titleOf = (task: OpenTask) =>
  task.isUnreadable ? HELM_COPY.unreadable : task.title;

/** A day that has passed, as it was: the events its plan saw, what was kept and got done ticked, and what wasn't under "Not done", which can be brought to today. Nothing on it is editable. */
function PastDay({ dayKey, sources }: PastDayProps) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { addToast } = useToast();
  const { timeZone, todayKey, planDays } = sources;
  const isBringing = useRef(false);
  const day = planDays[dayKey];
  const open = useAppSelector(selectOpenTasksById);
  const keptIds = Object.values(day?.slots ?? {})
    .filter((slot) => slot.status === 'kept')
    .map((slot) => slot.taskId);
  const fetched = useFetchedTasks(
    uid,
    keptIds.filter((id) => !open.has(id)),
  );
  const tasks = new Map([...fetched, ...open.values()].map((t) => [t.id, t]));
  const dayStart = zonedDateTimeToEpoch(dayKey, '00:00', timeZone);
  const dayEnd = zonedDateTimeToEpoch(
    shiftDayKey(dayKey, 1),
    '00:00',
    timeZone,
  );
  const kept = keptIds.flatMap((id) => {
    const task = tasks.get(id);
    return task ? [task] : [];
  });
  const done = kept.filter(
    (task) =>
      task.completedAt !== null &&
      task.completedAt >= dayStart &&
      task.completedAt < dayEnd,
  );
  const notDone = kept.filter((task) => task.status === 'open');
  const onToday = new Set(
    Object.values(planDays[todayKey]?.slots ?? {})
      .filter((slot) => slot.status !== 'notToday')
      .map((slot) => slot.taskId),
  );
  const bringable = notDone.filter((task) => !onToday.has(task.id));
  const events = day?.calendarSnapshot ?? [];

  const bring = () => {
    if (!uid || isBringing.current) return;
    isBringing.current = true;
    Promise.all(bringable.map((task) => bringToToday(uid, todayKey, task.id)))
      .then(() =>
        addToast({
          title: HELM_COPY.planBroughtToToday(bringable.length),
          type: 'info',
        }),
      )
      .catch((error: unknown) => {
        console.error('Helm task was not brought to today', error);
        addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
      })
      .finally(() => {
        isBringing.current = false;
      });
  };

  return (
    <>
      <p className='text-muted-foreground text-[15px]'>
        {HELM_COPY.planYesterday}
      </p>
      {events.map((event) => (
        <div
          key={event.eventRef}
          className='helm-card flex min-h-14 items-center gap-3 px-4 py-3'
        >
          <span className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'>
            <CalendarDays className='size-5' aria-hidden='true' />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='text-foreground block text-[15px] leading-[21px] break-words'>
              {event.title}
            </span>
            <span className='text-muted-foreground block text-[13px]'>
              {event.isAllDay
                ? HELM_COPY.syncedAllDay
                : formatSlotRange(event.startAt, event.endAt, timeZone)}
            </span>
          </span>
        </div>
      ))}
      {done.length > 0 && (
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {done.map((task) => (
            <li key={task.id} className='flex items-center gap-3 px-4 py-3'>
              <TickMark variant='soft' className='size-6' />
              <span className='text-muted-foreground min-w-0 flex-1 text-[15px] leading-[21px] break-words'>
                {titleOf(task)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {notDone.length > 0 && (
        <section className='space-y-3'>
          <SectionDivider label={HELM_COPY.planNotDone} />
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {notDone.map((task) => (
              <li key={task.id} className='flex items-center gap-3 px-4 py-3'>
                <span
                  aria-hidden='true'
                  className='border-muted-foreground/60 size-6 shrink-0 rounded-full border-2'
                />
                <span className='min-w-0 flex-1 text-[15px] leading-[21px] break-words'>
                  {titleOf(task)}
                </span>
                {onToday.has(task.id) && (
                  <span className='text-muted-foreground shrink-0 text-[13px]'>
                    {HELM_COPY.planOnToday}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {bringable.length > 0 && (
            <Button
              type='button'
              variant='secondary'
              className='w-full'
              onClick={bring}
            >
              {HELM_COPY.planBringToToday}
            </Button>
          )}
        </section>
      )}
      {events.length === 0 && kept.length === 0 && (
        <p className='text-muted-foreground text-[15px]'>
          {HELM_COPY.planNothingThatDay}
        </p>
      )}
    </>
  );
}

export default PastDay;
