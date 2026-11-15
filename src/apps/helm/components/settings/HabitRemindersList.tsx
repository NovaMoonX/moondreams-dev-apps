import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import DetailSheet from '@/components/DetailSheet';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatClockTime } from '@/utils/formatUtils';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import { HELM_COPY } from '@apps/helm/constants';
import {
  setQuietHours,
  setRemindersPaused,
} from '@apps/helm/store/actions/settingsActions';
import { selectKeptHabits } from '@apps/helm/store/selectors/habitSelectors';

interface HabitRemindersListProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenHabit: (habitId: string) => void;
}

interface QuietHoursFieldsProps {
  start: string;
  end: string;
  onSave: (start: string, end: string) => void;
}

function QuietHoursFields({ start, end, onSave }: QuietHoursFieldsProps) {
  const fieldId = useId();
  const [from, setFrom] = useState(start);
  const [until, setUntil] = useState(end);
  const save = () => {
    if (from !== '' && until !== '' && (from !== start || until !== end)) {
      onSave(from, until);
    }
  };
  return (
    <div className='grid grid-cols-2 gap-3'>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-from`} className='text-sm font-medium'>
          {HELM_COPY.habitRemindersQuietFrom}
        </label>
        <Input
          id={`${fieldId}-from`}
          type='time'
          variant='outline'
          className='helm-field'
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          onBlur={save}
        />
      </div>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-until`} className='text-sm font-medium'>
          {HELM_COPY.habitRemindersQuietTo}
        </label>
        <Input
          id={`${fieldId}-until`}
          type='time'
          variant='outline'
          className='helm-field'
          value={until}
          onChange={(event) => setUntil(event.target.value)}
          onBlur={save}
        />
      </div>
    </div>
  );
}

/** Settings' habit reminders: pause them all, set quiet hours, and see which habits remind. A habit's own pace and lock-screen name are changed on its page. */
function HabitRemindersList({
  isOpen,
  onClose,
  onOpenHabit,
}: HabitRemindersListProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const profile = useAppSelector((state) => state.helm.profile);
  const habits = useAppSelector(selectKeptHabits);
  const reminding = habits.filter((habit) => habit.reminder?.isOn === true);
  const quiet = profile?.quietHours ?? null;

  const fail = (error: unknown) => {
    console.error('Helm habit reminders were not changed', error);
    addToast({ title: HELM_COPY.habitRemindersSaveFailed, type: 'error' });
  };

  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.habitRemindersTitle}
    >
      {isOpen && !profile && (
        <p className='text-muted-foreground text-[15px]'>
          {HELM_COPY.habitRemindersLoading}
        </p>
      )}
      {isOpen && profile && (
        <div className='space-y-5'>
          <div className='flex items-center gap-3'>
            <div className='min-w-0 flex-1'>
              <p className='text-foreground text-[15px] leading-[21px] font-medium'>
                {HELM_COPY.habitRemindersPauseAll}
              </p>
              <p className='text-muted-foreground text-[13px]'>
                {HELM_COPY.habitRemindersPauseAllHelp}
              </p>
            </div>
            <AppToggle
              checked={profile.remindersPausedAt !== null}
              onCheckedChange={(isPaused) =>
                user && setRemindersPaused(user.uid, isPaused).catch(fail)
              }
              aria-label={HELM_COPY.habitRemindersPauseAll}
            />
          </div>
          <div className='space-y-3'>
            <div className='flex items-center gap-3'>
              <div className='min-w-0 flex-1'>
                <p className='text-foreground text-[15px] leading-[21px] font-medium'>
                  {HELM_COPY.habitRemindersQuietTitle}
                </p>
                <p className='text-muted-foreground text-[13px]'>
                  {quiet
                    ? `${formatClockTime(quiet.start)} to ${formatClockTime(quiet.end)}`
                    : HELM_COPY.habitRemindersQuietHelp}
                </p>
              </div>
              <AppToggle
                checked={quiet !== null}
                onCheckedChange={(isOn) =>
                  user &&
                  setQuietHours(
                    user.uid,
                    isOn
                      ? { start: profile.dayEndTime, end: profile.dayStartTime }
                      : null,
                  ).catch(fail)
                }
                aria-label={HELM_COPY.habitRemindersQuietTitle}
              />
            </div>
            {quiet && (
              <QuietHoursFields
                key={`${quiet.start}-${quiet.end}`}
                start={quiet.start}
                end={quiet.end}
                onSave={(start, end) =>
                  user && setQuietHours(user.uid, { start, end }).catch(fail)
                }
              />
            )}
          </div>
          {reminding.length === 0 ? (
            <p className='text-muted-foreground text-[15px] text-pretty'>
              {HELM_COPY.habitRemindersEmpty}
            </p>
          ) : (
            <ul className='helm-card divide-border divide-y overflow-hidden'>
              {reminding.map((habit) => (
                <li key={habit.id}>
                  <Button
                    type='button'
                    variant='tertiary'
                    className='flex h-auto w-full items-center justify-between gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                    onClick={() => {
                      onClose();
                      onOpenHabit(habit.id);
                    }}
                  >
                    <span className='min-w-0 flex-1'>
                      <PrivateTitle
                        kind='habit'
                        record={habit}
                        className='text-foreground block text-[15px] leading-[21px]'
                      >
                        {habit.name}
                      </PrivateTitle>
                      <span className='text-muted-foreground block text-[13px]'>
                        {habit.reminder
                          ? HELM_COPY.remindersPaceLine(
                              habit.reminder.pace,
                              habit.isCare || habit.forWhoId !== null,
                              habit.lockScreenName !== null,
                            )
                          : ''}
                      </span>
                    </span>
                    <ChevronRight
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.habitRemindersFoot}
          </p>
        </div>
      )}
    </DetailSheet>
  );
}

export default HabitRemindersList;
