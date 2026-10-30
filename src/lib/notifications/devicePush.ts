import { deleteToken, getMessaging, isSupported } from 'firebase/messaging';

import { app } from '@/lib/firebase/config';

import {
  readRememberedToken,
  registerDeviceToken,
  unregisterDeviceToken,
} from './registerDeviceToken';
import {
  askNotificationPermission,
  getDeviceToken,
} from './requestPushPermission';

/** `blocked`: the browser refused notifications for this site and only its settings can change that. `off`: not asked yet on this device. */
export type DevicePushState = 'unsupported' | 'blocked' | 'off' | 'on';

/** `dismissed`: the person closed the browser's question without answering, so nothing changed. `failed`: allowed, but the device could not be registered (no connection, or the browser's push service did not answer). */
export type TurnOnResult =
  'on' | 'blocked' | 'unsupported' | 'dismissed' | 'failed';

/** The browser's push setup after a person has allowed notifications waits on a service worker that a dev server never registers, and a token write waits on the server; a person is never left waiting on either. */
const SETUP_TIMEOUT_MS = 10_000;

const getPermission = () => Notification.permission;

/** Whether this device can be reached right now, checked at once: allowed by the browser. */
export function isDevicePushOn(): boolean {
  return typeof Notification !== 'undefined' && getPermission() === 'granted';
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
export async function readDevicePushState(): Promise<DevicePushState> {
  if (!(await canPush())) return 'unsupported';
  if (getPermission() === 'denied') return 'blocked';
  if (getPermission() === 'granted') return 'on';
  return 'off';
}

const withTimeout = <T>(work: Promise<T>) =>
  Promise.race([
    work,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), SETUP_TIMEOUT_MS),
    ),
  ]);

/** Asks the browser for permission (only when it has not been asked) and registers this device. Call it from a tap. The browser's question is never timed out, so a slow Allow still counts. */
export async function turnOnDevicePush(uid: string): Promise<TurnOnResult> {
  if (!(await canPush())) return 'unsupported';
  if (getPermission() === 'denied') return 'blocked';

  try {
    const permission = await askNotificationPermission();
    if (permission === 'denied') return 'blocked';
    if (permission !== 'granted') return 'dismissed';

    const token = await withTimeout(getDeviceToken());
    if (token === null) return 'failed';

    await withTimeout(registerDeviceToken(uid, token));
    return 'on';
  } catch {
    return 'failed';
  }
}

/** The token to take off the person: the one remembered at registration, else (a device registered before that was kept) the browser's own, which it only gives to a device it already allows, so this never asks for anything. */
const findToken = async (uid: string) => {
  const remembered = readRememberedToken(uid);
  if (remembered !== null) return remembered;
  if (!(await canPush()) || getPermission() !== 'granted') return null;

  return withTimeout(getDeviceToken());
};

/** Deletes the token from the browser's push service. It can wait on that service, so it is never what a person is held up by. */
const deleteBrowserToken = async () => {
  try {
    if (await canPush()) await deleteToken(getMessaging(app));
  } catch {
    // A token left in the browser is already off the person's account, and FCM drops it once it expires or is reported gone.
  }
};

/** Takes this device's token off one account and keeps the browser's copy, for a switch: the next account registers the same token, so pushes follow whoever is signed in. */
export async function detachDevicePush(uid: string): Promise<void> {
  try {
    const token = await findToken(uid);
    if (token) await unregisterDeviceToken(uid, token);
  } catch (error) {
    console.error('Push token not taken off the account', error);
  }
}

/** Signing out hands the device on: its token leaves the person who signed out, so nothing meant for them reaches whoever uses it next. Resolves once the token is off their account; the browser's own copy is deleted afterwards without waiting. Signing in again registers a fresh token. */
export async function releaseDevicePush(uid: string): Promise<void> {
  await detachDevicePush(uid);
  void deleteBrowserToken();
}
