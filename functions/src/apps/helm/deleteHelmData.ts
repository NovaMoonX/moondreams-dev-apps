import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isSignInRecent } from '../../auth/recentSignIn.js';
import { endReaderGrants } from '../../connections/endReaderGrants.js';
import { READER_SINKS } from '../../connections/registry.js';
import { GOOGLE_SECRETS } from '../../connections/tokens.js';
import { dropBoxKeyPath, wrappedKeyPath } from './helmKey.js';

if (getApps().length === 0) {
  initializeApp();
}

const userPath = (uid: string) => `apps/helm/users/${uid}`;
const serverPath = (uid: string) => `apps/helm/server/${uid}`;
const mediaPrefix = (uid: string) => `apps/helm/media/${uid}/`;
// No other app records voice usage yet, so the whole tree is this app's; once one does, only this app's days may go.
const voiceUsagePath = (uid: string) => `voiceUsage/${uid}`;

/** Deletes a document or collection and everything below it and returns how many documents were removed. */
async function deleteTree(
  firestore: Firestore,
  target: DocumentReference | CollectionReference,
) {
  let count = 0;
  const writer = firestore.bulkWriter();
  writer.onWriteResult(() => {
    count += 1;
  });
  await firestore.recursiveDelete(target, writer);
  return count;
}

async function deleteMedia(uid: string) {
  const bucket = getStorage().bucket();
  const [files] = await bucket.getFiles({ prefix: mediaPrefix(uid) });
  await bucket.deleteFiles({ prefix: mediaPrefix(uid) });
  return files.length;
}

async function deleteUserCollections(firestore: Firestore, uid: string) {
  const counts = await Promise.all(
    (await firestore.doc(userPath(uid)).listCollections()).map((collection) =>
      deleteTree(firestore, collection),
    ),
  );
  return counts.reduce((sum, value) => sum + value, 0);
}

/** The wrapped data key goes last, so a run that stopped part way can run again and still finish. */
async function deleteServerTree(firestore: Firestore, uid: string) {
  const dataKey = wrappedKeyPath(uid);
  const counts = await Promise.all(
    (await firestore.doc(serverPath(uid)).listCollections()).flatMap(
      (collection) =>
        collection.id === 'keys' ? [] : [deleteTree(firestore, collection)],
    ),
  );
  const dropBox = await deleteTree(
    firestore,
    firestore.doc(dropBoxKeyPath(uid)),
  );
  const key = await deleteTree(firestore, firestore.doc(dataKey));
  const rest = await deleteTree(firestore, firestore.doc(serverPath(uid)));
  return counts.reduce((sum, value) => sum + value, dropBox + key + rest);
}

/**
 * Removes everything the app holds for the signed-in person: every connection it holds, the user tree's collections, kept media,
 * voice usage, the server tree (the wrapped data key last) and then the profile document. Needs a sign-in from the last five minutes; a rerun finishes.
 */
export const deleteHelmData = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 300,
    enforceAppCheck: true,
    secrets: [
      ...GOOGLE_SECRETS,
      ...Object.values(READER_SINKS).flatMap((sink) => sink.secrets),
    ],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to delete your data.');
    }
    if (!isSignInRecent(request.auth?.token?.auth_time, Date.now())) {
      throw new HttpsError(
        'failed-precondition',
        'Sign in again to delete your data.',
        { reason: 'recent-sign-in' },
      );
    }

    const firestore = getFirestore();
    try {
      const grants = await endReaderGrants({ uid, readerAppId: 'helm' });
      const collections = await deleteUserCollections(firestore, uid);
      const files = await deleteMedia(uid);
      const usage = await deleteTree(
        firestore,
        firestore.doc(voiceUsagePath(uid)),
      );
      // The key and the profile stay until every connection has ended, so the person can still run it again from Settings.
      if (grants.failed > 0) throw new Error('grants-not-ended');
      const server = await deleteServerTree(firestore, uid);
      // Other open devices reopen to first run when the profile vanishes, so it goes after the key: a reopen never fetches a new key that this run then deletes.
      const profile = await deleteTree(firestore, firestore.doc(userPath(uid)));
      const result = {
        grants: grants.ended,
        documents: collections + usage + server + profile,
        files,
      };
      logger.info('helm.data.deleted', result);
      return result;
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      logger.error('helm.data.deleteFailed', {
        code:
          typeof code === 'string' || typeof code === 'number'
            ? code
            : 'unknown',
      });
      throw new HttpsError(
        'internal',
        'Your data was not fully deleted. Run the delete again to finish.',
      );
    }
  },
);
