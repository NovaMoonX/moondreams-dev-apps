import { createSealedReader } from '@lib/security';

import { store } from '@/store';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { fetchCaptureById } from '@apps/helm/store/listeners/captureListener';
import type { CaptureAnswer } from '@apps/helm/types';

/** A turn that is not in the store, opened; null when it is gone or won't open. */
export async function loadCaptureWords(
  uid: string,
  captureId: string,
): Promise<{ text: string; answer: CaptureAnswer | null } | null> {
  const encryption = await getHelmEncryption(uid);
  const read = createSealedReader(encryption, openJson);
  const capture = await fetchCaptureById(uid, read, captureId);
  if (store.getState().helm.uid !== uid) return null;
  return capture && !capture.isUnreadable && capture.text
    ? { text: capture.text, answer: capture.answer }
    : null;
}
