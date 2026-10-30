import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

if (getApps().length === 0) {
  initializeApp();
}

const readTokens = (value: unknown) =>
  Array.isArray(value) ? value.filter((token): token is string => typeof token === 'string') : [];

/**
 * A device's push token belongs to whoever registered it last. When someone switches accounts on a
 * device, the old account may not get to remove the token before the switch, so this takes it off
 * every other account and that device stops receiving the previous account's pushes.
 */
export const claimDeviceToken = onDocumentWritten(
  { document: 'users/{uid}', region: 'us-central1' },
  async (change) => {
    const uid = change.params.uid;
    const before = new Set(readTokens(change.data?.before.data()?.fcmTokens));
    const added = readTokens(change.data?.after.data()?.fcmTokens).filter((token) => !before.has(token));
    if (added.length === 0) {
      return;
    }

    const firestore = getFirestore();
    const holders = await Promise.all(
      added.map((token) =>
        firestore.collection('users').where('fcmTokens', 'array-contains', token).get(),
      ),
    );
    const removals = holders.flatMap((snapshot, index) =>
      snapshot.docs
        .filter((doc) => doc.id !== uid)
        .map((doc) => doc.ref.update({ fcmTokens: FieldValue.arrayRemove(added[index]) })),
    );
    await Promise.all(removals);
  },
);
