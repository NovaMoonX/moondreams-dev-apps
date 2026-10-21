import type { TurnOnResult } from './devicePush';

/** How to get unstuck when the browser won't let this site send notifications. */
export const getDeviceNotificationsText = (state: 'blocked' | 'unsupported') =>
  state === 'blocked'
    ? 'This site is blocked from sending notifications. Allow them in your browser’s site settings, then come back.'
    : 'This browser can’t show reminders. On an iPhone or iPad, add this site to your Home Screen and open it from there.';

/** The note under a failed attempt to turn notifications on; nothing for a closed question, which changed nothing. */
export const getTurnOnFailureText = (result: TurnOnResult) =>
  result === 'failed'
    ? 'We couldn’t turn reminders on. Check your connection and try again.'
    : null;
