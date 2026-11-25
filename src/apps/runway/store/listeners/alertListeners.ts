import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@lib/security';
import { openJson } from '@apps/runway/security';
import type {
  AlertDoc,
  AlertSealed,
  AlertStateDoc,
  OpenAlert,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

const alertsRef = (uid: string, name: 'alerts' | 'alertStates') =>
  collection(db, 'apps', 'runway', 'plans', uid, name);

/** An alert whose sealed words did not open to a target and a line is left out rather than guessed. */
const openAlert = (
  data: AlertDoc,
  payload: Partial<AlertSealed>,
): OpenAlert | null =>
  payload.target && payload.line
    ? {
        id: data.id,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt ?? data.createdAt,
        target: payload.target,
        line: payload.line,
        isNamed: payload.isNamed ?? false,
      }
    : null;

/** Every alert. A slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startAlertsListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (alerts: OpenAlert[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption, openJson);

  const stop = onSnapshot(
    alertsRef(uid, 'alerts'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map(async (entry) => {
            const data = { ...(entry.data() as AlertDoc), id: entry.id };
            return openAlert(
              data,
              await read<Partial<AlertSealed>>(data.sealed),
            );
          }),
        );
        if (current !== sequence.latest || run.isStopped) return;
        onChange(opened.filter((alert) => alert !== null));
      } catch (error) {
        if (current === sequence.latest) onError(toError(error));
      }
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}

/** Where each alert stands, as the server last worked it out; the phone only reads it. */
export function startAlertStatesListener(
  uid: string,
  onChange: (states: AlertStateDoc[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    alertsRef(uid, 'alertStates'),
    (snapshot) =>
      onChange(
        snapshot.docs.map((entry) => ({
          ...(entry.data() as AlertStateDoc),
          id: entry.id,
        })),
      ),
    (error) => onError(toError(error)),
  );
}
