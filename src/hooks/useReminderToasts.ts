import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { APP_REGISTRY_ID_MAP } from '@lib/app';
import type { ReminderStatus } from '@/lib/notifications/types';
import { useAppSelector } from '@/store';

const REMINDER_TOAST_DURATION_MS = 7000;

/** Bridges the global `reminders` slice into in-app toasts: a reminder that
 * transitions to `sent` while this is mounted pops a toast. Reminders already
 * `sent` at mount never toast, so reloading the page doesn't replay old ones. */
export function useReminderToasts() {
  const reminders = useAppSelector((state) => state.reminders.items);
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const previousStatusByIdRef = useRef<Map<string, ReminderStatus> | null>(null);

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
      .forEach((reminder) => {
        addToast({
          id: reminder.id,
          title: reminder.title,
          description: reminder.body,
          type: 'reminder',
          duration: REMINDER_TOAST_DURATION_MS,
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
      });
  }, [reminders, addToast, navigate, location.pathname]);
}
