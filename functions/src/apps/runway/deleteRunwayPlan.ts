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

if (getApps().length === 0) {
  initializeApp();
}

export const DELETE_PLAN_PHRASE = 'delete my plan';
export const RECENT_SIGN_IN_MS = 5 * 60 * 1000;
const CHUNK = 300;

const planPath = (uid: string) => `apps/runway/plans/${uid}`;
const serverPath = (uid: string) => `apps/runway/server/${uid}`;
const receiptsPrefix = (uid: string) => `apps/runway/receipts/${uid}/`;

const isSignInRecent = (authTimeSeconds: unknown, now: number) =>
  typeof authTimeSeconds === 'number' &&
  now - authTimeSeconds * 1000 <= RECENT_SIGN_IN_MS;

const isPhraseRight = (value: unknown) =>
  typeof value === 'string' &&
  value.trim().toLowerCase().replace(/\s+/g, ' ') === DELETE_PLAN_PHRASE;

/** Removes the documents that exist under a collection and every subcollection below them, children before parents, and returns how many existed. */
async function deleteCollection(
  firestore: Firestore,
  collection: CollectionReference,
): Promise<number> {
  const refs = await collection.listDocuments();
  const chunks = Array.from(
    { length: Math.ceil(refs.length / CHUNK) },
    (_, index) => refs.slice(index * CHUNK, (index + 1) * CHUNK),
  );
  const counts: number[] = [];
  for (const chunk of chunks) {
    const below = await Promise.all(
      chunk.map(async (ref: DocumentReference) => {
        const subcollections = await ref.listCollections();
        const counted = await Promise.all(
          subcollections.map((sub) => deleteCollection(firestore, sub)),
        );
        return counted.reduce((sum, value) => sum + value, 0);
      }),
    );
    const snapshots = await firestore.getAll(...chunk, { fieldMask: [] });
    const existing = snapshots.filter((snapshot) => snapshot.exists);
    const writer = firestore.bulkWriter();
    const deletions = existing.map((snapshot) => writer.delete(snapshot.ref));
    await writer.close();
    await Promise.all(deletions);
    counts.push(existing.length + below.reduce((sum, value) => sum + value, 0));
  }
  return counts.reduce((sum, value) => sum + value, 0);
}

async function deleteDocumentTree(
  firestore: Firestore,
  ref: DocumentReference,
): Promise<number> {
  const collections = await ref.listCollections();
  const counts = await Promise.all(
    collections.map((collection) => deleteCollection(firestore, collection)),
  );
  const below = counts.reduce((sum, value) => sum + value, 0);
  const snapshot = await ref.get();
  if (snapshot.exists) await ref.delete();
  return below + (snapshot.exists ? 1 : 0);
}

async function deleteReceiptObjects(uid: string): Promise<number> {
  const [files] = await getStorage()
    .bucket()
    .getFiles({ prefix: receiptsPrefix(uid) });
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  return files.length;
}

/**
 * Removes the signed-in person's whole plan: every document under it (children first, the plan document last so an
 * interrupted run can be run again), the wrapped data key, and their receipt images. A plan that is already gone answers 0.
 */
export const deleteRunwayPlan = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 300,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to delete your plan.');
    }
    if (!isPhraseRight(request.data?.phrase)) {
      throw new HttpsError(
        'invalid-argument',
        `Type "${DELETE_PLAN_PHRASE}" exactly to delete your plan.`,
      );
    }
    if (!isSignInRecent(request.auth?.token?.auth_time, Date.now())) {
      throw new HttpsError(
        'failed-precondition',
        'Sign in again to delete your plan.',
        { reason: 'recent-sign-in' },
      );
    }

    const firestore = getFirestore();
    try {
      const plan = firestore.doc(planPath(uid));
      const planChildren = await plan.listCollections();
      const childCounts = await Promise.all(
        planChildren.map((collection) =>
          deleteCollection(firestore, collection),
        ),
      );
      const planDoc = await plan.get();
      if (planDoc.exists) await plan.delete();
      const strays = await plan.listCollections();
      const strayCounts = await Promise.all(
        strays.map((collection) => deleteCollection(firestore, collection)),
      );
      const serverCount = await deleteDocumentTree(
        firestore,
        firestore.doc(serverPath(uid)),
      );
      const receipts = await deleteReceiptObjects(uid);

      const documents =
        childCounts.reduce((sum, value) => sum + value, 0) +
        strayCounts.reduce((sum, value) => sum + value, 0) +
        (planDoc.exists ? 1 : 0) +
        serverCount;
      logger.info('runway.plan.deleted', { documents, receipts });
      const result = { deleted: documents, receipts };
      return result;
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      logger.error('runway.plan.deleteFailed', {
        code:
          typeof code === 'string' || typeof code === 'number'
            ? code
            : 'unknown',
      });
      throw new HttpsError(
        'internal',
        'Your plan was not fully deleted. Run the delete again to finish.',
      );
    }
  },
);
