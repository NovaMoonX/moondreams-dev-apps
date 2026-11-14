import { useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { CalendarCheck, ChevronRight, CircleStop } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import HabitEditSheet from '@apps/helm/components/habits/HabitEditSheet';
import HabitPauseSheet from '@apps/helm/components/habits/HabitPauseSheet';
import HabitWeek from '@apps/helm/components/habits/HabitWeek';
import HabitWhenSheet from '@apps/helm/components/habits/HabitWhenSheet';
import { useHabitWhoName } from '@apps/helm/components/habits/useHabitWhoName';
import PrivateRow from '@apps/helm/components/privacy/PrivateRow';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY, HABIT_NOTES_SHOWN } from '@apps/helm/constants';
import { windowInstants } from '@apps/helm/engine/habitDay';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  setHabitCare,
  setHabitStatus,
} from '@apps/helm/store/actions/habitActions';
import { selectHabitById } from '@apps/helm/store/selectors/habitSelectors';
import type { OpenHabit } from '@apps/helm/types';
import { formatCadence } from '@apps/helm/utils/habitDraft';
import { readHabitStatus } from '@apps/helm/utils/habitToday';
import { formatSlotRange } from '@apps/helm/utils/planDays';
import { formatWeekdayDayUTC } from '@apps/helm/utils/taskDue';

const { option, separator } = DropdownMenuFactories;

interface HabitScreenProps {
  habitId: string | null;
  backLabel: string;
  onBack: () => void;
  onHome: () => void;
}

const readWindowsLine = (habit: OpenHabit) => {
  if (habit.timesPerDay !== null) {
    return HELM_COPY.habitWindowsCount(habit.timesPerDay);
  }
  const labels = Object.entries(habit.windowState)
    .sort(([, left], [, right]) => left.order - right.order)
    .map(([id]) => habit.windows[id]?.label ?? '')
    .filter(Boolean);
  return labels.length > 0
    ? labels.join(', ')
    : HELM_COPY.habitWindowsThroughDay;
};

/** One habit: what it is, how often, this week and its notes; a way to change its words and times, pause it, stop it, and mark it medicine or care. */
function HabitScreen({ habitId, backLabel, onBack, onHome }: HabitScreenProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const assistantName = useAssistantName();
  const clock = useHabitClock();
  const { isLoaded } = useAppSelector((state) => state.helm.habits);
  const habit = useAppSelector(selectHabitById).get(habitId ?? '') ?? null;
  const days = useAppSelector((state) => state.helm.habitDays.byId);
  const whoName = useHabitWhoName(habit ?? { forWhoId: null });
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingWhen, setIsChangingWhen] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isAllNotes, setIsAllNotes] = useState(false);
  const [isWritingCare, setIsWritingCare] = useState(false);
  const name = habit && !habit.isUnreadable ? habit.name : '';

  useScreenContext('habit', null, [], {
    ask: name ? HELM_COPY.askHabit(name) : HELM_COPY.habitsTitle,
    chip: HELM_COPY.chipAbout(name || HELM_COPY.habitsTitle),
    back: name ? HELM_COPY.backToHabit(name) : HELM_COPY.backToHabits,
  });

  const status = habit ? readHabitStatus(habit, clock.dayKey) : 'active';
  const isPaused = habit?.status === 'paused' && status === 'paused';
  const notes = Object.entries(days)
    .flatMap(([dayKey, day]) =>
      Object.entries(day.notes).flatMap(([key, note]) => {
        const [noteHabit, windowId] = key.split('/');
        return noteHabit === habit?.id
          ? [{ key: `${dayKey}/${key}`, dayKey, windowId, note }]
          : [];
      }),
    )
    .sort((left, right) => right.note.at - left.note.at);
  const shownNotes = isAllNotes ? notes : notes.slice(0, HABIT_NOTES_SHOWN);

  const reportStatusFailure = (error: unknown) => {
    console.error('Helm habit was not changed', error);
    addToast({ title: HELM_COPY.habitStatusFailed, type: 'error' });
  };

  const changeStatus = (
    next: 'active' | 'paused' | 'ended',
    toast: string,
    until: number | null = null,
  ) => {
    if (!user || !habit) return;
    const change = setHabitStatus(user.uid, habit, next, until);
    change.written.catch(reportStatusFailure);
    addToast({
      title: toast,
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () =>
          void change
            .undo()
            .then((outcome) => {
              if (outcome === 'kept')
                addToast({ title: HELM_COPY.habitUndoKept, type: 'info' });
            })
            .catch((error: unknown) => {
              console.error('Helm habit was not put back', error);
              addToast({ title: HELM_COPY.habitUndoFailed, type: 'error' });
            }),
      },
    });
  };

  const stop = async () => {
    if (!habit) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.habitStopTitle(habit.name),
      message: HELM_COPY.habitStopMessage,
      confirmText: HELM_COPY.habitStopAction,
      destructive: true,
    });
    if (isConfirmed) {
      changeStatus('ended', HELM_COPY.habitStoppedToast(habit.name));
    }
  };

  const toggleCare = async (isCare: boolean) => {
    if (!user || !habit || isWritingCare) return;
    if (!isCare && habit.forWhoId !== null) {
      addToast({ title: HELM_COPY.habitCareForWho, type: 'info' });
      return;
    }
    if (!isCare) {
      const isConfirmed = await confirm({
        title: HELM_COPY.habitCareOffTitle,
        message: HELM_COPY.habitCareOffMessage(habit.name),
        confirmText: HELM_COPY.habitCareOffAction,
        cancelText: HELM_COPY.habitCareKeep,
      });
      if (!isConfirmed) return;
    }
    setIsWritingCare(true);
    try {
      const { result, undo } = await setHabitCare(
        user.uid,
        await getHelmEncryption(user.uid),
        habit,
        isCare,
      );
      if (result === 'offline') {
        addToast({ title: HELM_COPY.habitCareNeedsConnection, type: 'info' });
      } else if (result !== 'saved') {
        addToast({ title: HELM_COPY.habitCareFailed, type: 'error' });
      } else if (isCare) {
        addToast({
          title: HELM_COPY.habitCareOnToast(habit.name),
          type: 'success',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void undo().catch((error: unknown) => {
                console.error('Helm habit care mark was not put back', error);
                addToast({ title: HELM_COPY.habitCareFailed, type: 'error' });
              }),
          },
        });
      }
    } catch (error) {
      console.error('Helm habit care mark did not save', error);
      addToast({ title: HELM_COPY.habitCareFailed, type: 'error' });
    } finally {
      setIsWritingCare(false);
    }
  };

  const menu =
    habit && !habit.isUnreadable
      ? {
          items: [
            option({ label: HELM_COPY.habitMenuEdit, value: 'edit' }),
            ...(habit.status === 'ended'
              ? [
                  option({
                    label: HELM_COPY.habitMenuRestart,
                    value: 'restart',
                  }),
                ]
              : [
                  isPaused
                    ? option({
                        label: HELM_COPY.habitMenuResume,
                        value: 'resume',
                      })
                    : option({
                        label: HELM_COPY.habitMenuPause,
                        value: 'pause',
                      }),
                  separator(),
                  option({
                    label: HELM_COPY.habitMenuStop,
                    value: 'stop',
                    icon: (
                      <CircleStop
                        className='text-destructive size-4'
                        aria-hidden='true'
                      />
                    ),
                  }),
                ]),
          ],
          onItemSelect: (value: string) => {
            if (value === 'edit') setIsEditing(true);
            else if (value === 'pause') setIsPausing(true);
            else if (value === 'resume') {
              changeStatus('active', HELM_COPY.habitResumedToast(habit.name));
            } else if (value === 'restart') {
              changeStatus('active', HELM_COPY.habitRestartedToast(habit.name));
            } else if (value === 'stop') void stop();
          },
        }
      : undefined;

  const statusLine =
    habit?.status === 'ended' && habit.endedAt !== null
      ? HELM_COPY.habitsStoppedOn(formatDateShortUTC(habit.endedAt))
      : isPaused && habit?.pausedUntil != null
        ? HELM_COPY.habitsPausedUntil(formatWeekdayDayUTC(habit.pausedUntil))
        : null;

  return (
    <>
      <HelmHeader
        backLabel={backLabel}
        onBack={onBack}
        onHome={onHome}
        menu={menu}
      />
      <main className='space-y-4 pt-4'>
        {isLoaded && !habit && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.habitGone}
          </p>
        )}
        {habit?.isUnreadable && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.habitUnreadable}
          </p>
        )}
        {habit && !habit.isUnreadable && (
          <>
            <div className='space-y-1'>
              <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
                <PrivateTitle kind='habit' record={habit}>
                  {habit.emoji ? (
                    <span aria-hidden='true'>{habit.emoji} </span>
                  ) : (
                    <CalendarCheck
                      className='text-muted-foreground mr-2 inline size-6 align-[-0.1em]'
                      aria-hidden='true'
                    />
                  )}
                  {habit.name}
                </PrivateTitle>
              </h1>
              <p className='text-[15px]'>
                {[
                  whoName === null ? null : HELM_COPY.habitForWho(whoName),
                  formatCadence(habit.cadence),
                ]
                  .filter((part): part is string => part !== null)
                  .join('\u00a0· ')}
              </p>
              <p className='text-muted-foreground text-[13px]'>
                {(habit.createdBy === 'nomos'
                  ? HELM_COPY.habitSinceBySaid
                  : HELM_COPY.habitSinceByHand)(
                  formatDateShortUTC(habit.startsOn),
                )}
              </p>
              {statusLine && (
                <p className='text-muted-foreground text-[13px]'>
                  {statusLine}
                </p>
              )}
              {habit.notes && (
                <p className='pt-1 text-[15px] break-words whitespace-pre-line'>
                  {habit.notes}
                </p>
              )}
            </div>
            <HabitWeek habit={habit} days={days} clock={clock} />
            {notes.length > 0 && (
              <section className='space-y-3'>
                <h2 className='text-muted-foreground text-[13px]'>
                  {HELM_COPY.habitNotesTitle}
                </h2>
                <ul className='helm-card divide-border divide-y overflow-hidden'>
                  {shownNotes.map(({ key, dayKey, windowId, note }) => (
                    <li key={key} className='space-y-0.5 px-4 py-3'>
                      <p className='text-muted-foreground text-[13px]'>
                        {HELM_COPY.habitNoteHeading(
                          formatWeekdayDayUTC(Date.parse(dayKey)),
                          habit.windows[windowId]?.label ?? null,
                        )}
                      </p>
                      <p className='text-[15px] break-words'>{`“${note.text}”`}</p>
                    </li>
                  ))}
                </ul>
                {notes.length > HABIT_NOTES_SHOWN && (
                  <ShowMoreButton
                    isOpen={isAllNotes}
                    onClick={() => setIsAllNotes((isOpen) => !isOpen)}
                  >
                    {isAllNotes
                      ? HELM_COPY.habitNotesShowFewer
                      : HELM_COPY.habitNotesShowAll(notes.length)}
                  </ShowMoreButton>
                )}
              </section>
            )}
            <section className='helm-card overflow-hidden'>
              <Button
                type='button'
                variant='tertiary'
                className='flex h-auto min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                onClick={() => setIsChangingWhen(true)}
              >
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block text-[15px] leading-[21px]'>
                    {HELM_COPY.habitWhenRow}
                  </span>
                  {Object.keys(habit.windowState).length === 0 ? (
                    <span className='text-muted-foreground block text-[13px]'>
                      {readWindowsLine(habit)}
                    </span>
                  ) : (
                    Object.entries(habit.windowState)
                      .sort(([, left], [, right]) => left.order - right.order)
                      .map(([id, window]) => {
                        const span = windowInstants(
                          clock.dayKey,
                          window,
                          clock.timeZone,
                        );
                        return (
                          <span
                            key={id}
                            className='text-muted-foreground block text-[13px] break-words'
                          >
                            {`${habit.windows[id]?.label ?? ''} · ${formatSlotRange(
                              span.startAt,
                              span.endAt,
                              clock.timeZone,
                            )}`}
                          </span>
                        );
                      })
                  )}
                </span>
                <ChevronRight
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            </section>
            <section className='helm-card'>
              <div className='flex items-center gap-3 px-4 py-3'>
                <div className='min-w-0 flex-1'>
                  <p className='text-foreground text-[15px] leading-[21px]'>
                    {HELM_COPY.habitCareRowTitle}
                  </p>
                  <p className='text-muted-foreground text-[13px]'>
                    {habit.forWhoId !== null
                      ? HELM_COPY.habitCareForWho
                      : HELM_COPY.habitCareRowSubtitle(assistantName)}
                  </p>
                </div>
                <AppToggle
                  checked={habit.isCare}
                  onCheckedChange={(isCare) => void toggleCare(isCare)}
                  aria-label={HELM_COPY.habitCareRowTitle}
                />
              </div>
            </section>
            {!habit.isCare && (
              <PrivateRow kind='habit' record={habit} title={habit.name} />
            )}
          </>
        )}
      </main>
      {habit && !habit.isUnreadable && (
        <>
          <HabitEditSheet
            isOpen={isEditing}
            onClose={() => setIsEditing(false)}
            habit={habit}
          />
          <HabitWhenSheet
            isOpen={isChangingWhen}
            onClose={() => setIsChangingWhen(false)}
            habit={habit}
          />
          <HabitPauseSheet
            isOpen={isPausing}
            name={habit.name}
            todayKey={clock.dayKey}
            onClose={() => setIsPausing(false)}
            onPause={(until) => {
              setIsPausing(false);
              changeStatus(
                'paused',
                until === null
                  ? HELM_COPY.habitPausedOpenToast(habit.name)
                  : HELM_COPY.habitPausedToast(
                      habit.name,
                      formatWeekdayDayUTC(until),
                    ),
                until,
              );
            }}
          />
        </>
      )}
    </>
  );
}

export default HabitScreen;
