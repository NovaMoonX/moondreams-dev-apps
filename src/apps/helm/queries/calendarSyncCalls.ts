import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';

export type SetHelmCalendarSyncRequest =
  | { action: 'make'; accountId: string }
  | { action: 'choose'; accountId: string; calendarId: string }
  | { action: 'stop' };

export interface SetHelmCalendarSyncResult {
  calendarName: string | null;
  removedCount: number;
  leftCount: number;
}

const setHelmCalendarSyncCallable = httpsCallable<
  SetHelmCalendarSyncRequest,
  SetHelmCalendarSyncResult
>(functions, 'setHelmCalendarSync');

export const CALENDAR_APP_CREATED_SCOPE =
  'https://www.googleapis.com/auth/calendar.app.created';
export const CALENDAR_EVENTS_SCOPE =
  'https://www.googleapis.com/auth/calendar.events';

/** The permission an action still needs from Google, or null when the refusal was something else. */
export const readNeededScope = (
  error: unknown,
  request: SetHelmCalendarSyncRequest,
) => {
  const { code, message, details } = (error ?? {}) as {
    code?: string;
    message?: string;
    details?: unknown;
  };
  if (code !== 'functions/failed-precondition') return null;
  if (
    !`${message ?? ''} ${JSON.stringify(details ?? '')}`.includes('needsScope')
  )
    return null;
  return request.action === 'make'
    ? CALENDAR_APP_CREATED_SCOPE
    : request.action === 'choose'
      ? CALENDAR_EVENTS_SCOPE
      : null;
};

/** Refused with `failed-precondition` (`needsScope`) until Google has granted the permission the action needs. */
export const setHelmCalendarSync = async (
  request: SetHelmCalendarSyncRequest,
) => {
  const { data } = await setHelmCalendarSyncCallable(request);
  return {
    calendarName: data?.calendarName ?? null,
    removedCount: Number(data?.removedCount) || 0,
    leftCount: Number(data?.leftCount) || 0,
  };
};
