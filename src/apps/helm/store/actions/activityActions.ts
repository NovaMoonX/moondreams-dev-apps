import { createSealedReader } from '@lib/security';

import { store } from '@/store';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { fetchCaptureById } from '@apps/helm/store/listeners/captureListener';

/** The words of a turn that is not in the store; null when it is gone or won't open. */
export async function loadCaptureText(
  uid: string,
  captureId: string,
): Promise<string | null> {
  const encryption = await getHelmEncryption(uid);
  const read = createSealedReader(encryption, openJson);
  const capture = await fetchCaptureById(uid, read, captureId);
  if (store.getState().helm.uid !== uid) return null;
  return capture && !capture.isUnreadable && capture.text ? capture.text : null;
}
