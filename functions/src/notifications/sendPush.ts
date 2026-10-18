import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';

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
  const tokens = userSnapshots.flatMap((userSnapshot) =>
    normalizeUids(userSnapshot.data()?.fcmTokens),
  );

  if (tokens.length > 0) {
    await messaging.sendEachForMulticast({
      tokens,
      notification: { title: content.title, body: content.body },
      webpush: { fcmOptions: { link: content.url } },
    });
  }

  return tokens.length;
}
