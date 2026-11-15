import { Button } from '@moondreamsdev/dreamer-ui/components';

import AppToggle from '@/components/AppToggle';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import LockScreenNameSwitch from '@apps/helm/components/habits/LockScreenNameSwitch';
import { useHabitChange } from '@apps/helm/components/habits/useHabitChange';
import { HELM_COPY } from '@apps/helm/constants';
import { setHabitReminder } from '@apps/helm/store/actions/habitActions';
import type { OpenHabit, ReminderPace } from '@apps/helm/types';

interface HabitReminderSheetProps {
  isOpen: boolean;
  onClose: () => void;
  habit: OpenHabit;
}

const PACES: readonly PillOption<ReminderPace>[] = [
  { value: 'adaptive', label: HELM_COPY.remindersPaceAdaptive },
  { value: 'start', label: HELM_COPY.remindersPaceStart },
  { value: 'late', label: HELM_COPY.remindersPaceLate },
];

const PACE_HELP: Record<ReminderPace, string> = {
  adaptive: HELM_COPY.remindersPaceAdaptiveHelp,
  start: HELM_COPY.remindersPaceStartHelp,
  late: HELM_COPY.remindersPaceLateHelp,
};

/** A habit's reminder settings: how it reminds, quiet hours, and whether its name shows on the lock screen. Each control takes effect at once and touches only itself. */
function HabitReminderSheet({
  isOpen,
  onClose,
  habit,
}: HabitReminderSheetProps) {
  const { user } = useAuth();
  const report = useHabitChange();
  const { reminder } = habit;
  if (!reminder) return null;
  const isCare = habit.isCare || habit.forWhoId !== null;

  const setPace = (pace: ReminderPace, isEase = false) => {
    if (!user || pace === reminder.pace) return;
    report(
      setHabitReminder(user.uid, habit, { kind: 'pace', pace, isEase }),
      HELM_COPY.remindersPaceToast(habit.name),
      HELM_COPY.remindersSheetSaveFailed,
    );
  };

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.remindersSheetTitle(habit.name)}
    >
      {isOpen && (
        <div className='space-y-5'>
          {isCare ? (
            <div className='flex items-center gap-3'>
              <div className='min-w-0 flex-1'>
                <p className='text-foreground text-[15px] leading-[21px] font-medium'>
                  {HELM_COPY.remindersEaseTitle}
                </p>
                <p className='text-muted-foreground text-[13px]'>
                  {HELM_COPY.remindersEaseHelp}
                </p>
              </div>
              <AppToggle
                checked={reminder.pace === 'late'}
                onCheckedChange={(isLate) =>
                  setPace(isLate ? 'late' : 'start', isLate)
                }
                aria-label={HELM_COPY.remindersEaseTitle}
              />
            </div>
          ) : (
            <div className='space-y-2'>
              <span className='block text-sm font-medium'>
                {HELM_COPY.remindersPaceTitle}
              </span>
              <PillGroup
                label={HELM_COPY.remindersPaceTitle}
                options={PACES}
                value={reminder.pace}
                onChange={(pace) => setPace(pace)}
              />
              <p className='text-muted-foreground text-[13px]'>
                {PACE_HELP[reminder.pace]}
              </p>
            </div>
          )}
          <div className='flex items-center gap-3'>
            <div className='min-w-0 flex-1'>
              <p className='text-foreground text-[15px] leading-[21px] font-medium'>
                {HELM_COPY.remindersQuietTitle}
              </p>
              <p className='text-muted-foreground text-[13px]'>
                {HELM_COPY.remindersQuietHelp}
              </p>
            </div>
            <AppToggle
              checked={reminder.allowQuietHours}
              onCheckedChange={(isAllowed) => {
                if (!user) return;
                report(
                  setHabitReminder(user.uid, habit, {
                    kind: 'quietHours',
                    isAllowed,
                  }),
                  HELM_COPY.remindersQuietToast(habit.name),
                  HELM_COPY.remindersSheetSaveFailed,
                );
              }}
              aria-label={HELM_COPY.remindersQuietTitle}
            />
          </div>
          <SectionDivider label={HELM_COPY.lockScreenNameSection} />
          <LockScreenNameSwitch habit={habit} />
          <ModalFooterActions
            rightActions={
              <Button type='button' onClick={onClose}>
                {HELM_COPY.remindersSheetDone}
              </Button>
            }
          />
        </div>
      )}
    </FormSheet>
  );
}

export default HabitReminderSheet;
