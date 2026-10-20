import type { DevicePushState, TurnOnResult } from './devicePush';

/** The line under the device's notification switch: the reason to allow them while off, and how to get unstuck when the browser won't let it. Empty while the device is still being read. */
export const getDeviceNotificationsText = (state: DevicePushState | null) => {
  if (state === null) return '';
  if (state === 'on') {
    return 'Moondreams apps can send reminders here. Turn it off to stop them all.';
  }
  if (state === 'blocked') {
    return 'This site is blocked from sending notifications. Allow them in your browser’s site settings, then come back.';
  }
  if (state === 'unsupported') {
    return 'This browser can’t show reminders. On an iPhone or iPad, add this site to your Home Screen and open it from there.';
  }
  return 'So Moondreams apps can nudge you, even when they are closed.';
};

/** The note under a failed attempt to turn notifications on; nothing for a closed question, which changed nothing. */
export const getTurnOnFailureText = (result: TurnOnResult) =>
  result === 'failed'
    ? 'We couldn’t turn reminders on. Check your connection and try again.'
    : null;
