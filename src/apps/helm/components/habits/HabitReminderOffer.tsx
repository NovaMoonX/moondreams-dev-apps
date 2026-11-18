import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';

import PushOptInRow from '@/components/PushOptInRow';
import { useAuth } from '@/hooks/useAuth';
import { devicePushQueryOptions } from '@/lib/notifications/notificationsQueries';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { setHabitReminder } from '@apps/helm/store/actions/habitActions';
import type { OpenHabit } from '@apps/helm/types';

interface HabitReminderOfferProps {
  habit: OpenHabit;
}

/** Offered once, on a habit's page right after it is made (the page decides when that is, once, so an open sheet never unmounts): remind me while it builds. The shared opt-in asks the browser first when it must, and the reminder is written only once a device is on. */
function HabitReminderOffer({ habit }: HabitReminderOfferProps) {
  const { user } = useAuth();
  const assistantName = useAssistantName();
  const device = useQuery(devicePushQueryOptions(user?.uid ?? '')).data ?? null;
  const isOffered =
    habit.status === 'active' &&
    (habit.reminder === null || habit.reminder.turnedOnAt >= habit.createdAt);
  if (!user || !isOffered || device === null) return null;
  const pace = habit.isCare || habit.forWhoId !== null ? 'start' : 'adaptive';

  return (
    <PushOptInRow
      uid={user.uid}
      icon={<BellRing className='size-4' />}
      title={HELM_COPY.habitOfferTitle}
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
      isSettingOn={habit.reminder?.isOn === true}
      onTurnedOn={async () => {
        if (habit.reminder?.isOn) return true;
        try {
          await setHabitReminder(user.uid, habit, { kind: 'on', pace }).written;
          return true;
        } catch (error) {
          console.error('Helm habit reminder was not turned on', error);
          return false;
        }
      }}
    />
  );
}

export default HabitReminderOffer;
