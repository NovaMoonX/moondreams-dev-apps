import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Messaging, SendResponse } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

export const APP_ORIGIN = 'https://apps.moondreams.dev';

/** An absolute URL on the app's own origin for a path-and-query, else null: a notification never opens another site. */
export function toAppUrl(path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    return null;
  }

  try {
    const url = new URL(path, APP_ORIGIN);
    return url.origin === APP_ORIGIN ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeUids(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((uid): uid is string => typeof uid === 'string');
}

export interface PushContent {
  title: string;
  body: string;
  /** Absolute, on the app's own origin: what a tap opens. */
  url: string;
}

/** The error codes with which FCM says a device token will never work again: the app was removed, the browser's permission was withdrawn or the token was replaced. */
export const DEAD_TOKEN_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
];

export interface DeviceToken {
  uid: string;
  token: string;
}

/** The devices FCM reported as gone, from the answers `sendEachForMulticast` gives in the order the tokens were sent. Any other failure (a busy service, a bad message) leaves a token alone. */
export function getDeadTokens(
  devices: DeviceToken[],
  responses: Pick<SendResponse, 'success' | 'error'>[],
): DeviceToken[] {
  return devices.filter((_, index) => {
    const code = responses[index]?.error?.code;
    return code !== undefined && DEAD_TOKEN_CODES.includes(code);
  });
}

/** Takes dead tokens off the people they were registered under, so the next push doesn't try them and a device that is no longer theirs stops receiving the person's notifications. Never throws: a failed clean-up only leaves them for the next run. */
async function removeDeadTokens(
  firestore: Firestore,
  dead: DeviceToken[],
): Promise<void> {
  const byUid = dead.reduce<Map<string, string[]>>(
    (groups, { uid, token }) =>
      groups.set(uid, [...(groups.get(uid) ?? []), token]),
    new Map(),
  );

  await Promise.all(
    [...byUid].map(([uid, tokens]) =>
      firestore
        .doc(`users/${uid}`)
        .update({ fcmTokens: FieldValue.arrayRemove(...tokens) })
        .catch((error) =>
          logger.error('Removing dead device tokens failed', { error }),
        ),
    ),
  );
}

/** Sends one push to every device registered under the given people (`users/{uid}.fcmTokens`) and returns how many devices it addressed. The one sender both scheduled functions use. */
export async function sendPushToUsers(
  firestore: Firestore,
  messaging: Messaging,
  uids: string[],
  content: PushContent,
): Promise<number> {
  const userSnapshots = await Promise.all(
    uids.map((uid) => firestore.doc(`users/${uid}`).get()),
  );
  const devices = userSnapshots.flatMap((userSnapshot, index) =>
    normalizeUids(userSnapshot.data()?.fcmTokens).map((token) => ({
      uid: uids[index],
      token,
    })),
  );

  if (devices.length > 0) {
    const { responses } = await messaging.sendEachForMulticast({
      tokens: devices.map((device) => device.token),
      notification: { title: content.title, body: content.body },
      webpush: { fcmOptions: { link: content.url } },
    });
    const dead = getDeadTokens(devices, responses);

    if (dead.length > 0) {
      logger.info('Removing device tokens FCM no longer accepts', {
        count: dead.length,
      });
      await removeDeadTokens(firestore, dead);
    }
  }

  return devices.length;
}
