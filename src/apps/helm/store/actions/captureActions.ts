import {
  collection,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { createSealedReader } from '@lib/security';

import { store } from '@/store';
import { CAPTURE_MAX_CHARS } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson, sealJson } from '@apps/helm/security';
import {
  addEarlierCaptures,
  setEarlierFailed,
  startLoadingEarlier,
} from '@apps/helm/store/helmSlice';
import { loadEarlierCaptures } from '@apps/helm/store/listeners/captureListener';
import { getRecentWindowStart } from '@apps/helm/utils/sessions';
import type {
  Capture,
  CaptureReading,
  CaptureSealed,
  HelmEncryption,
} from '@apps/helm/types';

const BATCH_LIMIT = 400;

const capturesOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'captures');

/** Seals what the person typed and starts writing it as a received turn; the write is handed back unawaited. The words are never edited afterwards. */
export async function sendCapture(
  uid: string,
  encryption: HelmEncryption,
  turn: {
    text: string;
    sessionId: string;
    turnIndex: number;
    createdAt: number;
    reading: CaptureReading;
  },
) {
  const text = turn.text.trim();
  if (!text || text.length > CAPTURE_MAX_CHARS) {
    throw new Error('A turn is 1 to 4,000 characters.');
  }
  const sealed = await sealJson<CaptureSealed>(
    { text, reading: turn.reading },
    encryption,
  );
  const { createdAt } = turn;
  // Typed on home, its card is seen as it is sent, so it never waits in New since you looked.
  const capture: Capture = {
    inputMode: 'typed',
    medium: 'web',
    sessionId: turn.sessionId,
    turnIndex: turn.turnIndex,
    status: 'received',
    seenAt: createdAt,
    createdAt,
    sealed,
  };
  return { write: setDoc(doc(capturesOf(uid)), capture) };
}

/** Brings in the next page of earlier sessions, once at a time; reads the store at the call, and stops if another person's Helm is open. */
export async function loadEarlierSessions(uid: string) {
  const { helm } = store.getState();
  if (helm.uid !== uid || helm.earlier.isLoading || helm.earlier.isExhausted) {
    return;
  }
  const before = Math.min(
    getRecentWindowStart(Date.now()),
    ...helm.earlier.captures.map((capture) => capture.createdAt),
  );
  store.dispatch(startLoadingEarlier());
  try {
    const encryption = await getHelmEncryption(uid);
    const page = await loadEarlierCaptures(
      uid,
      createSealedReader(encryption, openJson),
      before,
    );
    if (store.getState().helm.uid !== uid) return;
    store.dispatch(addEarlierCaptures(page));
  } catch (error) {
    console.error('Helm earlier turns did not load', error);
    store.dispatch(setEarlierFailed());
  }
}

export const markCaptureSeen = (uid: string, captureId: string) =>
  updateDoc(doc(capturesOf(uid), captureId), { seenAt: Date.now() });

/** Marks every given turn seen, in batches under Firestore's write limit. */
export async function markAllSeen(uid: string, captureIds: string[]) {
  const seenAt = Date.now();
  const chunks = Array.from(
    { length: Math.ceil(captureIds.length / BATCH_LIMIT) },
    (_, index) =>
      captureIds.slice(index * BATCH_LIMIT, (index + 1) * BATCH_LIMIT),
  );
  await Promise.all(
    chunks.map((ids) => {
      const batch = writeBatch(db);
      ids.forEach((id) => batch.update(doc(capturesOf(uid), id), { seenAt }));
      return batch.commit();
    }),
  );
}
