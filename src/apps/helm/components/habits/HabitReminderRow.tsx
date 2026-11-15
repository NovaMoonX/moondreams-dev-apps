import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import PushOptInRow from '@/components/PushOptInRow';
import { useAuth } from '@/hooks/useAuth';
import { devicePushQueryOptions } from '@/lib/notifications/notificationsQueries';
import { useAppSelector } from '@/store';
import { formatTime } from '@/utils/formatUtils';
import HabitReminderSheet from '@apps/helm/components/habits/HabitReminderSheet';
import { useHabitChange } from '@apps/helm/components/habits/useHabitChange';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { setHabitReminder } from '@apps/helm/store/actions/habitActions';
import { selectNextHabitReminder } from '@apps/helm/store/selectors/habitReminderSelectors';
import type { OpenHabit } from '@apps/helm/types';

interface HabitReminderRowProps {
  habit: OpenHabit;
  now: number;
  /** The offer above is asking, so this row leaves the opt-in to it; decided once when the page opens. */
  isOptInHidden: boolean;
}

const readLine = (habit: OpenHabit, next: number | null, isFresh: boolean) => {
  const { reminder } = habit;
  if (!reminder?.isOn) return null;
  if (reminder.pace === 'adaptive' && habit.stage === 'formed') {
    return HELM_COPY.remindersFormedQuiet;
  }
  if (isFresh && next === null) return HELM_COPY.remindersStartsSoon;
  return next === null
    ? HELM_COPY.remindersNoneToday
    : HELM_COPY.remindersNext(formatTime(next));
};

/** Reminders on a habit's page: one switch with its pace and the next reminder under it, and a row that opens the rest. With no device that can take a push it shows the shared opt-in instead, and the reminder is written only once a device is on. */
function HabitReminderRow({
  habit,
  now,
  isOptInHidden,
}: HabitReminderRowProps) {
  const { user } = useAuth();
  const assistantName = useAssistantName();
  const report = useHabitChange();
  const device = useQuery(devicePushQueryOptions(user?.uid ?? '')).data ?? null;
  const next = useAppSelector((state) =>
    selectNextHabitReminder(state, habit.id, now),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isFresh, setIsFresh] = useState(false);
  const isCare = habit.isCare || habit.forWhoId !== null;
  const isOn = habit.reminder?.isOn === true;

  if (!user || (habit.status !== 'active' && habit.status !== 'paused')) {
    return null;
  }

  const turnOn = () => {
    const change = setHabitReminder(user.uid, habit, {
      kind: 'on',
      pace: isCare ? 'start' : 'adaptive',
    });
    setIsFresh(true);
    return change;
  };

  const change = (isNowOn: boolean) => {
    if (isNowOn) {
      report(
        turnOn(),
        HELM_COPY.remindersOnToast(habit.name),
        HELM_COPY.remindersTurnOnFailed,
      );
      return;
    }
    setIsFresh(false);
    report(
      setHabitReminder(user.uid, habit, { kind: 'off' }),
      HELM_COPY.remindersOffToast(habit.name),
      HELM_COPY.remindersTurnOnFailed,
    );
  };

  const line = device === 'on' ? readLine(habit, next, isFresh) : null;

  return (
    <section className='space-y-3'>
      <div className='helm-card overflow-hidden'>
        <div className='flex items-center gap-3 px-4 py-3'>
          <div className='min-w-0 flex-1'>
            <p className='text-foreground text-[15px] leading-[21px]'>
              {HELM_COPY.remindersRowTitle}
            </p>
            <p className='text-muted-foreground text-[13px] break-words'>
              {habit.reminder?.isOn
                ? HELM_COPY.remindersPaceLine(
                    habit.reminder.pace,
                    isCare,
                    habit.lockScreenName !== null,
                  )
                : HELM_COPY.remindersRowOff}
            </p>
            {line && (
              <p className='text-muted-foreground text-[13px]'>{line}</p>
            )}
            {habit.reminder?.isOn && habit.stage === 'buildingAgain' && (
              <p className='text-muted-foreground text-[13px]'>
                {HELM_COPY.remindersAgainLine}
              </p>
            )}
          </div>
          <AppToggle
            checked={isOn}
            onCheckedChange={change}
            aria-label={HELM_COPY.remindersRowTitle}
          />
        </div>
        {isOn && !isOptInHidden && (
          <PushOptInRow
            uid={user.uid}
            icon={<Bell className='size-4' />}
            title={HELM_COPY.remindersPushTitle}
            modalTitle={HELM_COPY.remindersPushModalTitle(habit.name)}
            body={
              <>
                <p>{HELM_COPY.remindersPushBody(assistantName)}</p>
                <p className='text-muted-foreground text-xs'>
                  {HELM_COPY.remindersPushPrivacy(assistantName)}
                </p>
              </>
            }
            doneText={HELM_COPY.remindersPushDone(assistantName)}
            isSettingOn={isOn}
            isInCard
            onTurnedOn={async () => {
              if (habit.reminder?.isOn) return true;
              setIsFresh(true);
              try {
                await turnOn().written;
                return true;
              } catch (error) {
                console.error('Helm habit reminder was not turned on', error);
                return false;
              }
            }}
          />
        )}
        {isOn && (
          <Button
            type='button'
            variant='tertiary'
            className='border-border flex h-auto min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-none border-0 border-t px-4 py-3 text-left focus-visible:-outline-offset-2'
            onClick={() => setIsOpen(true)}
          >
            <span className='text-foreground min-w-0 flex-1 text-[15px] leading-[21px]'>
              {HELM_COPY.remindersMore}
            </span>
            <ChevronRight
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          </Button>
        )}
      </div>
      <HabitReminderSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        habit={habit}
      />
    </section>
  );
}

export default HabitReminderRow;
