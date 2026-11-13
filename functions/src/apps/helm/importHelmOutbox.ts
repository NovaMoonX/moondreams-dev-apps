import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import {
  DROP_BOX_MAX_ITEMS,
  buildDropBoxCapture,
  openEnvelope,
  planImport,
  readEnvelope,
  readPayload,
  unwrapDropBoxKey,
  type DropBoxKeyDoc,
} from './dropBox.js';
import type { Keyring } from '../../appKeys/keyring.js';
import { HELM_MASTER_KEYS } from './getHelmKey.js';
import { dropBoxKeyPath, sealForHelm, unwrapHelmKey } from './helmKey.js';
import { loadKeyringOrFail } from './sortHelmCapture.js';

if (getApps().length === 0) {
  initializeApp();
}

const CANNOT_OPEN = "Helm can't open your things right now.";

const toRejectedId = (item: unknown, index: number) => {
  const id = (item as { id?: unknown } | null)?.id;
  return typeof id === 'string' && id.length <= 64 ? id : `item-${index}`;
};

async function unwrapBoth(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  stored: DropBoxKeyDoc,
) {
  try {
    return {
      privateKey: unwrapDropBoxKey(keyring, uid, stored),
      dataKey: await unwrapHelmKey(firestore, keyring, uid),
    };
  } catch {
    logger.error('helm.keys.unwrapFailed', { route: 'importHelmOutbox' });
    throw new HttpsError('failed-precondition', CANNOT_OPEN);
  }
}

export const importHelmOutbox = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 30,
    enforceAppCheck: true,
    secrets: [HELM_MASTER_KEYS],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
    }
    const items = (request.data as { items?: unknown } | null)?.items;
    if (!Array.isArray(items) || items.length > DROP_BOX_MAX_ITEMS) {
      throw new HttpsError(
        'invalid-argument',
        `Send up to ${DROP_BOX_MAX_ITEMS} saved things at a time.`,
      );
    }
    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();

    const stored = await firestore.doc(dropBoxKeyPath(uid)).get();
    if (!stored.exists) {
      throw new HttpsError('failed-precondition', CANNOT_OPEN);
    }
    const { privateKey, dataKey } = await unwrapBoth(
      firestore,
      keyring,
      uid,
      stored.data() as DropBoxKeyDoc,
    );

    const now = Date.now();
    const opened = await Promise.all(
      items.map(async (item, index) => {
        const envelope = readEnvelope(item);
        if (!envelope) return { id: toRejectedId(item, index), payload: null };
        try {
          const payload = readPayload(
            await openEnvelope(privateKey, uid, envelope),
            envelope,
            now,
          );
          return { id: envelope.id, payload };
        } catch {
          return { id: envelope.id, payload: null };
        }
      }),
    );

    const captures = firestore.collection(`apps/helm/users/${uid}/captures`);
    const plan = await firestore.runTransaction(async (transaction) => {
      const readable = Array.from(
        new Set(opened.flatMap(({ id, payload }) => (payload ? [id] : []))),
      ).map((id) => captures.doc(id));
      const snapshots =
        readable.length > 0 ? await transaction.getAll(...readable) : [];
      const settled = planImport(
        opened,
        new Set(
          snapshots.filter((entry) => entry.exists).map((entry) => entry.id),
        ),
      );
      settled.toCreate.forEach((payload) =>
        transaction.create(
          captures.doc(payload.captureId),
          buildDropBoxCapture(
            payload,
            sealForHelm(dataKey, {
              text: payload.text,
              reading: payload.reading,
              answer: null,
              questionAnswer: null,
            }),
          ),
        ),
      );
      return settled;
    });

    logger.info('helm.dropBox.imported', {
      created: plan.toCreate.length,
      held: plan.held.length,
      rejected: plan.rejected.length,
    });
    return { held: plan.held, rejected: plan.rejected };
  },
);
