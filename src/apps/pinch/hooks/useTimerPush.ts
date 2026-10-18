import { useEffect, useRef } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { isDevicePushOn } from '@/lib/notifications/devicePush';
import {
  cancelReminder,
  scheduleReminder,
} from '@/lib/notifications/scheduleReminder';
import { useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { TIMER_PUSH_GRACE_MS } from '@apps/pinch/constants';
import type { CookTimer } from '@apps/pinch/hooks/useCookTimers';
import { selectPinchSettings } from '@apps/pinch/store/selectors';
import { getTimerCaption } from '@apps/pinch/utils/cooks';

interface Scheduled {
  reminderId: string;
  endsAt: number;
}

/**
 * Backs each running cooking timer with a push that goes out just after its end, for when the screen is off, while the person has turned timer pushes on and this device is reachable. Pausing, resetting, dismissing or leaving cancels it; a timer that ends while the page is open cancels it too, since the page rings by itself. Neither call is awaited by the timer, and a failure is only logged.
 */
export function useTimerPush(timers: CookTimer[]) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const isOn = useAppSelector(
    (state) => selectPinchSettings(state).reminders.timers,
  );
  const scheduledRef = useRef(new Map<string, Scheduled>());

  useEffect(() => {
    const scheduled = scheduledRef.current;
    const cancel = (timerId: string, entry: Scheduled) => {
      scheduled.delete(timerId);
      cancelReminder(entry.reminderId).catch((error) =>
        console.error('Timer push could not be cancelled', error),
      );
    };

    scheduled.forEach((entry, timerId) => {
      const timer = timers.find((candidate) => candidate.id === timerId);
      const isStillWanted =
        isOn && timer?.status === 'running' && timer.endsAt === entry.endsAt;
      if (isStillWanted) return;
      const isRingingAway =
        timer?.status === 'done' && document.visibilityState === 'hidden';
      if (isRingingAway) {
        scheduled.delete(timerId);
        return;
      }
      cancel(timerId, entry);
    });

    if (uid === null || !isOn || !isDevicePushOn(uid)) return;

    timers.forEach((timer) => {
      if (timer.status !== 'running' || scheduled.has(timer.id)) return;
      const reminderId = generateUuid();
      scheduled.set(timer.id, { reminderId, endsAt: timer.endsAt });
      scheduleReminder({
        id: reminderId,
        appId: 'pinch',
        targetUids: [uid],
        title: 'Timer done',
        body: `${getTimerCaption(timer)} · ${timer.label}`,
        scheduledFor: timer.endsAt + TIMER_PUSH_GRACE_MS,
        createdBy: uid,
        link: '/pinch',
      }).catch((error) => {
        scheduled.delete(timer.id);
        console.error('Timer push could not be scheduled', error);
      });
    });
  }, [timers, isOn, uid]);

  useEffect(() => {
    const scheduled = scheduledRef.current;
    return () => {
      scheduled.forEach((entry, timerId) => {
        scheduled.delete(timerId);
        cancelReminder(entry.reminderId).catch((error) =>
          console.error('Timer push could not be cancelled', error),
        );
      });
    };
  }, []);
}
