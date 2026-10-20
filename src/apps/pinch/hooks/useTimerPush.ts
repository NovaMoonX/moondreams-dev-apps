import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { isDevicePushOn } from '@/lib/notifications/devicePush';
import { scheduleReminder } from '@/lib/notifications/scheduleReminder';
import { useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { TIMER_PUSH_GRACE_MS } from '@apps/pinch/constants';
import type { CookTimer } from '@apps/pinch/hooks/useCookTimers';
import { cancelTimerPush } from '@apps/pinch/lib/timerPush';
import { selectPinchSettings } from '@apps/pinch/store/selectors';
import {
  getTimerCaption,
  getTimerPushAction,
  needsTimerPush,
} from '@apps/pinch/utils/cooks';

interface Scheduled {
  reminderId: string;
  endsAt: number;
}

const adopt = (timers: CookTimer[], reminderIds: Record<string, string>) =>
  new Map(
    timers.flatMap((timer): [string, Scheduled][] =>
      timer.status === 'running' && reminderIds[timer.id] !== undefined
        ? [
            [
              timer.id,
              { reminderId: reminderIds[timer.id], endsAt: timer.endsAt },
            ],
          ]
        : [],
    ),
  );

/**
 * Backs each running cooking timer with a push that goes out just after its end, for when the screen is off, while the person has turned timer pushes on and this device is reachable. Pausing, resetting, dismissing or leaving cancels it; a timer that ends while the page is open cancels it too, since the page rings by itself, and the push it leaves when hidden is marked so the in-app toast skips it. `restoredIds` hands back the pushes of a session picked up again (by timer id), so they are kept or cancelled, never doubled. Returns each timer's push id, and a number that changes when one is written, for the saved copy.
 */
export function useTimerPush(
  timers: CookTimer[],
  restoredIds: Record<string, string>,
) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const isOn = useAppSelector(
    (state) => selectPinchSettings(state).reminders.timers,
  );
  const [scheduled] = useState(() => adopt(timers, restoredIds));
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    scheduled.forEach((entry, timerId) => {
      const timer = timers.find((candidate) => candidate.id === timerId);
      const action = getTimerPushAction(timer, entry.endsAt, {
        isOn,
        isHidden: document.visibilityState === 'hidden',
      });
      if (action === 'keep') return;
      scheduled.delete(timerId);
      if (action === 'cancel') cancelTimerPush(entry.reminderId);
    });

    if (uid === null || !isOn || !isDevicePushOn()) return;

    const now = Date.now();
    timers.forEach((timer) => {
      if (scheduled.has(timer.id) || !needsTimerPush(timer, now)) return;
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
        inAppToast: false,
      })
        .then(() => setRevision((current) => current + 1))
        .catch((error) => {
          scheduled.delete(timer.id);
          console.error('Timer push could not be scheduled', error);
        });
    });
  }, [timers, isOn, uid, scheduled]);

  useEffect(
    () => () => {
      scheduled.forEach((entry, timerId) => {
        scheduled.delete(timerId);
        cancelTimerPush(entry.reminderId);
      });
    },
    [scheduled],
  );

  const getReminderId = useCallback(
    (timerId: string) => scheduled.get(timerId)?.reminderId ?? null,
    [scheduled],
  );
  return { getReminderId, pushRevision: revision };
}
