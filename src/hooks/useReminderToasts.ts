import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { APP_REGISTRY_ID_MAP } from '@lib/app';
import { TOAST_APP_LABELS } from '@components/toastTypeStyles';
import { isUsingFirebaseEmulators } from '@/lib/firebase/config';
import type { Reminder, ReminderStatus } from '@/lib/notifications/types';
import { useAppSelector } from '@/store';

const REMINDER_TOAST_DURATION_MS = 7000;
const FORCE_TOAST_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_FORCE_REMINDER_TOAST === 'true';

/** Bridges the global `reminders` slice into in-app toasts: a reminder that
 * transitions to `sent` while this is mounted pops a toast. Reminders already
 * `sent` at mount never toast, so reloading the page doesn't replay old ones. */
export function useReminderToasts() {
  const reminders = useAppSelector((state) => state.reminders.items);
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const previousStatusByIdRef = useRef<Map<string, ReminderStatus> | null>(null);
  const shownIdsRef = useRef(new Set<string>());

  const showReminderToast = useCallback(
    (reminder: Reminder, duration = REMINDER_TOAST_DURATION_MS) => {
      if (shownIdsRef.current.has(reminder.id)) {
        return;
      }
      shownIdsRef.current.add(reminder.id);

      const appName = APP_REGISTRY_ID_MAP[reminder.appId]?.name;
      if (appName) {
        TOAST_APP_LABELS.set(reminder.id, appName);
      }

      addToast({
        id: reminder.id,
        title: reminder.title,
        description: reminder.body,
        type: 'reminder',
        duration,
        action: {
          label: 'View',
          onClick: () => {
            const path = APP_REGISTRY_ID_MAP[reminder.appId]?.path;
            if (path && location.pathname !== path) {
              navigate(path);
            }
          },
        },
      });
    },
    [addToast, navigate, location.pathname],
  );

  useEffect(() => {
    if (!FORCE_TOAST_ENABLED) {
      return;
    }

    showReminderToast(
      {
        id: 'debug-reminder-toast',
        appId: 'waypoint',
        targetUids: [],
        title: 'Lunch at Salt Creek',
        body: 'Starting in 20 minutes.',
        scheduledFor: Date.now(),
        status: 'sent',
        channels: ['push'],
        relatedEntityPath: null,
        recurrence: 'none',
        createdBy: '',
        createdAt: Date.now(),
      },
      0,
    );
  }, [showReminderToast]);

  useEffect(() => {
    if (!isUsingFirebaseEmulators) {
      return;
    }

    // The scheduled sender doesn't run against the emulators, so fire due reminders locally.
    const timers = reminders
      .filter((reminder) => reminder.status === 'pending')
      .map((reminder) =>
        setTimeout(() => showReminderToast(reminder), Math.max(0, reminder.scheduledFor - Date.now())),
      );

    return () => timers.forEach(clearTimeout);
  }, [reminders, showReminderToast]);

  useEffect(() => {
    const previousStatusById = previousStatusByIdRef.current;
    previousStatusByIdRef.current = new Map(
      reminders.map((reminder) => [reminder.id, reminder.status]),
    );

    if (!previousStatusById) {
      return;
    }

    reminders
      .filter(
        (reminder) =>
          reminder.status === 'sent' && previousStatusById.get(reminder.id) !== 'sent',
      )
      .forEach((reminder) => showReminderToast(reminder));
  }, [reminders, showReminderToast]);
}
