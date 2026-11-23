import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  EmailIntakeState,
  EmailSetupProgress,
} from '@/lib/emailForwarding/types';
import type { AListEmailEvent } from '@apps/a-list/types';

const EVENT_LIMIT = 30;

const memberPath = (uid: string) =>
  ['apps', 'a-list', 'memberships', uid] as const;

const toMillis = (value: unknown) =>
  typeof value === 'number'
    ? value
    : typeof (value as Timestamp | null)?.toMillis === 'function'
      ? (value as Timestamp).toMillis()
      : 0;

/** The forwarding address, which Functions write; null until it exists. */
export function startEmailIntakeListener(
  uid: string,
  onChange: (intake: EmailIntakeState | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, ...memberPath(uid), 'emailIntake', 'address'),
    (snapshot) =>
      onChange(
        snapshot.exists() ? (snapshot.data() as EmailIntakeState) : null,
      ),
    onError,
  );
}

/** How far the member got setting up forwarding; null until they start. */
export function startEmailProgressListener(
  uid: string,
  onChange: (progress: EmailSetupProgress | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, ...memberPath(uid), 'emailSetup', 'progress'),
    (snapshot) =>
      onChange(
        snapshot.exists() ? (snapshot.data() as EmailSetupProgress) : null,
      ),
    onError,
  );
}

/** The latest emails that reached the address, newest first. */
export function startEmailEventsListener(
  uid: string,
  onChange: (events: AListEmailEvent[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, ...memberPath(uid), 'emailEvents'),
      orderBy('receivedAt', 'desc'),
      limit(EVENT_LIMIT),
    ),
    (snapshot) =>
      onChange(
        snapshot.docs.map((entry) => {
          const data = entry.data();
          return {
            ...data,
            id: entry.id,
            expiresAt: toMillis(data.expiresAt),
          } as AListEmailEvent;
        }),
      ),
    onError,
  );
}
