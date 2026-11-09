import { useMemo } from 'react';

import SectionDivider from '@/components/SectionDivider';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import {
  DUE_SOON_DAYS,
  formatTaskDue,
  getDueDaysAway,
  getDueSortKey,
  isOverdue,
} from '@apps/helm/utils/taskDue';

interface TodayViewProps {
  onBack: () => void;
  onHome: () => void;
}

/** Today: the open tasks that are overdue or due in the next week, soonest first; its first-run line until there is a task. */
function TodayView({ onBack, onHome }: TodayViewProps) {
  const assistantName = useAssistantName();
  const now = useNow(60_000);
  const {
    items: tasks,
    isLoaded,
    isFailed,
  } = useAppSelector((state) => state.helm.openTasks);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const dueSoon = useMemo(
    () =>
      tasks
        .flatMap((task) =>
          task.due && getDueDaysAway(task.due, timeZone, now) <= DUE_SOON_DAYS
            ? [{ task, due: task.due }]
            : [],
        )
        .sort((a, b) => getDueSortKey(a.due) - getDueSortKey(b.due)),
    [tasks, timeZone, now],
  );

  return (
    <>
      <HelmHeader backLabel='Home' onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <h1 className='helm-serif text-[28px] leading-[34px]'>Today</h1>
        {isFailed && !isLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.tasksFailed}
          </p>
        )}
        {isLoaded && tasks.length === 0 && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.todayFirstRun(assistantName)}
          </p>
        )}
        {isLoaded && tasks.length > 0 && (
          <section className='space-y-3'>
            <SectionDivider label={HELM_COPY.todayDueSoon} />
            {dueSoon.length === 0 ? (
              <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
                {HELM_COPY.nothingDueSoon}
              </p>
            ) : (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {dueSoon.map(({ task, due }) => {
                  const line = formatTaskDue(due, timeZone, now);
                  const isLate = isOverdue(due, timeZone, now);
                  return (
                    <li key={task.id} className='px-4 py-3'>
                      <p className='text-[15px] leading-[21px] break-words'>
                        {task.isUnreadable ? HELM_COPY.unreadable : task.title}
                      </p>
                      <p
                        className={
                          isLate
                            ? 'text-[13px] break-words text-[var(--helm-overdue)]'
                            : 'text-muted-foreground text-[13px] break-words'
                        }
                      >
                        {isLate ? HELM_COPY.overdueDue(line) : line}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}

export default TodayView;
