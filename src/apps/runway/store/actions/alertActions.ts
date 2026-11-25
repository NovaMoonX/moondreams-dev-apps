import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { sealJson } from '@apps/runway/security';
import type {
  AlertDoc,
  AlertSealed,
  OpenAlert,
  RunwayEncryption,
} from '@apps/runway/types';

const alertRef = (uid: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'alerts', id);

const toPayload = (alert: AlertSealed): AlertSealed => ({
  target: alert.target,
  line: alert.line,
  isNamed: alert.isNamed,
});

/** Sets a new alert; resolves with it. */
export async function createAlert(
  uid: string,
  encryption: RunwayEncryption,
  input: AlertSealed,
): Promise<OpenAlert> {
  const id = generateUuid();
  const now = Date.now();
  await setDoc(alertRef(uid, id), {
    id,
    createdAt: now,
    updatedAt: now,
    sealed: await sealJson(toPayload(input), encryption),
  } satisfies AlertDoc);
  return { ...toPayload(input), id, createdAt: now, updatedAt: now };
}

/** Changes where an alert goes off or whether it names its envelope; the newer `updatedAt` makes it start over from where things stand. */
export async function updateAlert(
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenAlert,
  input: AlertSealed,
): Promise<void> {
  await updateDoc(alertRef(uid, previous.id), {
    updatedAt: Math.max(Date.now(), previous.updatedAt + 1),
    sealed: await sealJson(toPayload(input), encryption),
  });
}

export async function deleteAlert(uid: string, id: string): Promise<void> {
  await deleteDoc(alertRef(uid, id));
}
