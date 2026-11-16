import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { CalendarDays } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { store } from '@/store';
import { formatList } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  countQuestions,
  questionsReadoutLine,
} from '@apps/helm/engine/questionsTask';
import { useLinkedNames } from '@apps/helm/hooks/useLinkedNames';
import {
  addKeptSlot,
  undoKeptSlot,
} from '@apps/helm/store/actions/planActions';
import { setReadyAnswer } from '@apps/helm/store/actions/taskActions';
import type { OpenTask } from '@apps/helm/types';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import {
  getMeetingDay,
  useResolvedMeeting,
} from '@apps/helm/utils/meetingWords';
import {
  formatClock,
  formatDayName,
  shiftDayKey,
  toDayKey,
} from '@apps/helm/utils/planDays';
import { getOpenings, toPlannerTask } from '@apps/helm/utils/planInput';
import type { PlanSources } from '@apps/helm/utils/planInput';

interface QuestionsReadyCardProps {
  task: OpenTask;
  sources: PlanSources | null;
  now: number;
  timeZone: string;
  onOpen: (taskId: string) => void;
}

/** "Do they feel ready?" before a meeting the task's questions are for, in the offer card's dashed look: I'm ready answers it, and Not yet, apart below a hairline, sets time aside before the meeting. */
function QuestionsReadyCard({
  task,
  sources,
  now,
  timeZone,
  onOpen,
}: QuestionsReadyCardProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const names = useLinkedNames(task)
    .filter((entry) => entry.kind !== 'place')
    .map((entry) =>
      entry.kind === 'person' ? entry.name.split(' ')[0] : entry.name,
    );
  const meeting = useResolvedMeeting(task);
  if (!meeting) return null;
  const meetingDay = getMeetingDay(meeting.startAt, now, timeZone);

  const fail = (error: unknown) => {
    console.error('Helm ready answer was not saved', error);
    addToast({ title: HELM_COPY.questionsActionFailed, type: 'error' });
  };
  const answer = async (value: 'ready' | 'notYet', at: number) => {
    await setReadyAnswer(user?.uid ?? '', task.id, {
      answer: value,
      at,
      forStartAt: meeting.startAt,
    });
  };
  const clearAnswer = () =>
    setReadyAnswer(user?.uid ?? '', task.id, null).catch(fail);

  const ready = (at: number) => {
    answer('ready', at)
      .then(() =>
        addToast({
          title: HELM_COPY.questionsReadyToast(meetingDay ?? 'today'),
          type: 'success',
          action: { label: HELM_COPY.undo, onClick: () => void clearAnswer() },
        }),
      )
      .catch(fail);
  };

  const findOpening = () => {
    if (!sources) return null;
    const meetingKey = toDayKey(meeting.startAt, timeZone);
    const plannerTask = toPlannerTask(task);
    return (
      Array.from({ length: 4 }, (_, index) =>
        shiftDayKey(sources.todayKey, index),
      )
        .filter((dayKey) => dayKey <= meetingKey)
        .flatMap((dayKey) =>
          getOpenings(sources, dayKey, plannerTask, null, 40)
            .filter((opening) => opening.endAt < meeting.startAt)
            .map((opening) => ({ dayKey, opening })),
        )
        .at(0) ?? null
    );
  };

  const notYet = (at: number) => {
    if (!user) return;
    const found = findOpening();
    if (!found || !sources) {
      addToast({ title: HELM_COPY.questionsNoTime, type: 'info' });
      onOpen(task.id);
      return;
    }
    const { uid } = user;
    const previous =
      Object.values(
        store.getState().helm.planDays.byId[found.dayKey]?.slots ?? {},
      ).find((held) => held.taskId === task.id) ?? null;
    Promise.all([
      addKeptSlot(uid, found.dayKey, {
        taskId: task.id,
        startAt: found.opening.startAt,
        endAt: found.opening.endAt,
        source: 'person',
      }),
      answer('notYet', at),
    ])
      .then(() =>
        addToast({
          title: HELM_COPY.questionsNotYetToast(
            formatClock(found.opening.startAt, timeZone),
            formatDayName(found.dayKey, sources.todayKey),
          ),
          type: 'info',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void Promise.all([
                undoKeptSlot(uid, found.dayKey, task.id, previous),
                setReadyAnswer(uid, task.id, null),
              ]).catch(fail),
          },
        }),
      )
      .catch(fail);
  };

  return (
    <section className='helm-card w-full space-y-3 border-dashed! border-[var(--helm-verdigris)]! p-4'>
      <Button
        type='button'
        variant='tertiary'
        className='h-auto w-full flex-col items-stretch justify-start gap-2 p-0 text-left whitespace-normal'
        aria-label={HELM_COPY.questionsOpenLabel(meeting.label ?? task.title)}
        onClick={() => onOpen(task.id)}
      >
        <PrivateTitle
          kind='task'
          record={task}
          className='text-foreground text-[15px] leading-[21px] font-medium text-pretty'
        >
          {questionsReadoutLine(
            countQuestions(task.stepState),
            names.length > 0 ? formatList(names) : null,
            meetingDay ?? 'today',
          )}
        </PrivateTitle>
        {meeting.label && (
          <span className='text-muted-foreground flex items-start gap-2 text-[13px] text-pretty'>
            <CalendarDays
              className='mt-0.5 size-3.5 shrink-0'
              aria-hidden='true'
            />
            <span className='min-w-0 break-words'>
              {HELM_COPY.questionsMeetingLabel(meeting.label)}
              <span className='whitespace-nowrap'>
                {HELM_COPY.questionsMeetingWhen(
                  formatClock(meeting.startAt, timeZone),
                )}
              </span>
            </span>
          </span>
        )}
        <span className='text-foreground block text-[15px] font-medium'>
          {HELM_COPY.questionsReadyAsk}
        </span>
      </Button>
      <Button
        type='button'
        className='w-full'
        onClick={() => ready(Date.now())}
      >
        {HELM_COPY.questionsReady}
      </Button>
      <div className='border-border flex justify-center border-t pt-3'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className="relative after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
          onClick={() => notYet(Date.now())}
        >
          {HELM_COPY.questionsNotYet}
        </Button>
      </div>
    </section>
  );
}

export default QuestionsReadyCard;
