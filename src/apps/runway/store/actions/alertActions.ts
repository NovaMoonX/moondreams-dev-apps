import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { sealJson } from '@apps/runway/security';
import type {
  AlertDoc,
  AlertLine,
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

const isSameLine = (a: AlertLine, b: AlertLine) =>
  a.kind === 'cents'
    ? b.kind === 'cents' && a.cents === b.cents
    : b.kind === 'share' && a.bps === b.bps;

/** Changes where an alert goes off or whether it names its envelope; a moved line gets a newer `updatedAt`, which makes it start over from where things stand, and a change of name alone keeps it. */
export async function updateAlert(
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenAlert,
  input: AlertSealed,
): Promise<void> {
  const isLineChanged = !isSameLine(previous.line, input.line);
  if (!isLineChanged && previous.isNamed === input.isNamed) return;
  await updateDoc(alertRef(uid, previous.id), {
    updatedAt: isLineChanged
      ? Math.max(Date.now(), previous.updatedAt + 1)
      : previous.updatedAt,
    sealed: await sealJson(toPayload(input), encryption),
  });
}

export async function deleteAlert(uid: string, id: string): Promise<void> {
  await deleteDoc(alertRef(uid, id));
}
