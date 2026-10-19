import { deleteToken, getMessaging, isSupported } from 'firebase/messaging';

import { app } from '@/lib/firebase/config';

import {
  readRememberedToken,
  registerDeviceToken,
  unregisterDeviceToken,
} from './registerDeviceToken';
import { requestPushPermission } from './requestPushPermission';

/** `blocked`: the browser refused notifications for this site and only its settings can change that. `off`: allowed or not yet asked, and not registered on this device. */
export type DevicePushState = 'unsupported' | 'blocked' | 'off' | 'on';

/** `dismissed`: the person closed the browser's question without answering, so nothing changed. `failed`: allowed, but the device could not be registered (no connection, or the browser's push service did not answer). */
export type TurnOnResult =
  'on' | 'blocked' | 'unsupported' | 'dismissed' | 'failed';

/** The browser's push setup waits on a service worker that a dev server never registers; a person is never left waiting on it. */
const SETUP_TIMEOUT_MS = 10_000;

const offKey = (uid: string) => `push-device-off:${uid}`;

/** Whether the person turned reminders off on this device, which the on-load registration then respects. */
export function isDevicePushOff(uid: string): boolean {
  try {
    return localStorage.getItem(offKey(uid)) === '1';
  } catch {
    return false;
  }
}

function setDevicePushOff(uid: string, isOff: boolean) {
  try {
    if (isOff) {
      localStorage.setItem(offKey(uid), '1');
    } else {
      localStorage.removeItem(offKey(uid));
    }
  } catch {
    // Without storage the choice lasts until the next reload.
  }
}

const getPermission = () => Notification.permission;

/** Whether this device can be reached right now, checked at once: allowed by the browser and not turned off here. */
export function isDevicePushOn(uid: string): boolean {
  return (
    typeof Notification !== 'undefined' &&
    getPermission() === 'granted' &&
    !isDevicePushOff(uid)
  );
}

async function canPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    return false;
  }

  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/** This device's state, read without asking for anything. */
export async function readDevicePushState(
  uid: string,
): Promise<DevicePushState> {
  if (!(await canPush())) return 'unsupported';
  if (getPermission() === 'denied') return 'blocked';
  if (getPermission() === 'granted' && !isDevicePushOff(uid)) return 'on';
  return 'off';
}

const withTimeout = <T>(work: Promise<T>) =>
  Promise.race([
    work,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), SETUP_TIMEOUT_MS),
    ),
  ]);

/** Asks the browser for permission (only when it has not been asked) and registers this device. Call it from a tap. */
export async function turnOnDevicePush(uid: string): Promise<TurnOnResult> {
  if (!(await canPush())) return 'unsupported';
  if (getPermission() === 'denied') return 'blocked';

  try {
    const token = await withTimeout(requestPushPermission());
    if (token) {
      await registerDeviceToken(uid, token);
      setDevicePushOff(uid, false);
      return 'on';
    }
  } catch {
    return 'failed';
  }

  if (getPermission() === 'denied') return 'blocked';
  return getPermission() === 'default' ? 'dismissed' : 'failed';
}

/** The token to take off the person: the one remembered at registration, else (a device registered before that was kept) the browser's own, which it only gives to a device it already allows, so this never asks for anything. */
const findToken = async (uid: string) => {
  const remembered = readRememberedToken(uid);
  if (remembered !== null) return remembered;
  if (!(await canPush()) || getPermission() !== 'granted') return null;

  return withTimeout(requestPushPermission());
};

/** Deletes the token from the browser's push service. It can wait on that service, so it is never what a person is held up by. */
const deleteBrowserToken = async () => {
  try {
    if (await canPush()) await deleteToken(getMessaging(app));
  } catch {
    // A token left in the browser is already off the person's account, and FCM drops it once it expires or is reported gone.
  }
};

/** Takes this device's token off the person's account first (the step that stops their pushes), then deletes it from the browser's push service, awaited only when `isBrowserTokenAwaited`. */
async function removeDeviceToken(uid: string, isBrowserTokenAwaited: boolean) {
  try {
    const token = await findToken(uid);
    if (token) await unregisterDeviceToken(uid, token);
  } catch (error) {
    console.error('Push token not taken off the account', error);
  }

  if (isBrowserTokenAwaited) {
    await deleteBrowserToken();
    return;
  }
  void deleteBrowserToken();
}

/** Stops pushes to this device: removes its token and remembers the choice. The choice is kept even when the token can't be reached, so a reload doesn't register it again. */
export async function turnOffDevicePush(uid: string): Promise<void> {
  setDevicePushOff(uid, true);
  await removeDeviceToken(uid, true);
}

/** Signing out hands the device on: its token leaves the person who signed out, so nothing meant for them reaches whoever uses it next. Resolves once the token is off their account; the browser's own copy is deleted afterwards without waiting. The choice to turn pushes off is not changed, and signing in again registers a fresh token. */
export const releaseDevicePush = (uid: string) => removeDeviceToken(uid, false);
