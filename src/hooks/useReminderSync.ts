import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { enablePushNotifications } from '@/lib/notifications/enablePushNotifications';
import { startRemindersListener } from '@/store/listeners/remindersListener';
import { setReminders } from '@/store/slices/remindersSlice';
import { useAppDispatch } from '@/store/index';

/** Central, app-wide: reminders where the signed-in user is in `targetUids`, regardless of mini-app. */
export function useReminderSync() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) {
      dispatch(setReminders([]));
      return;
    }

    const unsubscribe = startRemindersListener(uid, (reminders) => {
      dispatch(setReminders(reminders));
    });

    return unsubscribe;
  }, [uid, dispatch]);

  useEffect(() => {
    if (uid) {
      void enablePushNotifications(uid);
    }
  }, [uid]);
}
