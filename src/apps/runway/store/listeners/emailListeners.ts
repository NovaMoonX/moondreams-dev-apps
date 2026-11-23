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

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@lib/security';
import { openJson } from '@apps/runway/security';
import type {
  EmailEventDoc,
  EmailEventSealed,
  EmailFilterDoc,
  EmailFilterSealed,
  EmailIntakeDoc,
  EmailIntakeSealed,
  EmailBank,
  EmailSetupDoc,
  EmailSetupSealed,
  RunwayEncryption,
} from '@apps/runway/types';

export interface OpenEmailIntake extends EmailIntakeSealed {
  token: string;
  createdAt: number;
  updatedAt: number;
  lastReceivedAt: number | null;
  confirmAt: number | null;
}

export interface OpenEmailEvent extends EmailEventSealed {
  id: string;
  receivedAt: number;
  outcome: EmailEventDoc['outcome'];
  purchaseId: string | null;
  expiresAt: number;
}

export interface OpenEmailFilter extends EmailFilterSealed {
  id: string;
  createdAt: number;
}

const EVENT_LIMIT = 50;

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

const toMillis = (value: unknown) =>
  typeof value === 'number'
    ? value
    : typeof (value as Timestamp | null)?.toMillis === 'function'
      ? (value as Timestamp).toMillis()
      : 0;

/** The forwarding address, which Functions write; null until it exists. A document that won't open is left out, since email is optional. */
export function startEmailIntakeListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (intake: OpenEmailIntake | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption, openJson);

  const stop = onSnapshot(
    doc(db, 'apps', 'runway', 'plans', uid, 'emailIntake', 'address'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const data = snapshot.exists()
          ? (snapshot.data() as EmailIntakeDoc)
          : null;
        const payload = data?.sealed
          ? await read<Partial<EmailIntakeSealed>>(data.sealed)
          : null;
        if (current !== sequence.latest || run.isStopped) return;
        onChange(
          data === null
            ? null
            : {
                token: data.token,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                lastReceivedAt: data.lastReceivedAt ?? null,
                confirmAt: data.confirmAt ?? null,
                confirmUrl: payload?.confirmUrl ?? null,
                confirmCode: payload?.confirmCode ?? null,
              },
        );
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

/** The latest emails that reached the address, newest first. */
export function startEmailEventsListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (events: OpenEmailEvent[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption, openJson);

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'runway', 'plans', uid, 'emailEvents'),
      orderBy('receivedAt', 'desc'),
      limit(EVENT_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const settled = await Promise.allSettled(
          snapshot.docs.map(async (entry): Promise<OpenEmailEvent> => {
            const data = entry.data() as EmailEventDoc;
            const payload = await read<Partial<EmailEventSealed>>(data.sealed);
            return {
              id: entry.id,
              receivedAt: data.receivedAt,
              outcome: data.outcome,
              purchaseId: data.purchaseId ?? null,
              expiresAt: toMillis(data.expiresAt),
              from: payload.from ?? '',
              subject: payload.subject ?? '',
              subjectTemplate: payload.subjectTemplate ?? '',
              snippet: payload.snippet ?? '',
              bodyText: payload.bodyText ?? null,
              readBy: payload.readBy ?? null,
            };
          }),
        );
        const opened = settled.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        );
        const failed = settled.find((result) => result.status === 'rejected');
        if (current !== sequence.latest || run.isStopped) return;
        onChange(opened);
        if (failed?.status === 'rejected') onError(toError(failed.reason));
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

/** Every filter the person made. */
export function startEmailFiltersListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (filters: OpenEmailFilter[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption, openJson);

  const stop = onSnapshot(
    collection(db, 'apps', 'runway', 'plans', uid, 'emailFilters'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map(async (entry): Promise<OpenEmailFilter> => {
            const data = entry.data() as EmailFilterDoc;
            const payload = await read<Partial<EmailFilterSealed>>(data.sealed);
            return {
              id: entry.id,
              createdAt: data.createdAt,
              fromAddress: payload.fromAddress ?? null,
              subjectTemplate: payload.subjectTemplate ?? null,
              subjectContains: payload.subjectContains ?? [],
              bodyContains: payload.bodyContains ?? [],
            };
          }),
        );
        if (current !== sequence.latest || run.isStopped) return;
        onChange(opened.sort((a, b) => b.createdAt - a.createdAt));
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

export interface OpenEmailSetup {
  provider: EmailSetupDoc['provider'];
  stepId: EmailSetupDoc['stepId'];
  doneAt: number | null;
  banks: EmailBank[];
}

const toBanks = (value: unknown): EmailBank[] =>
  Array.isArray(value)
    ? value.flatMap((entry: Partial<EmailBank> | null) =>
        entry && typeof entry.id === 'string' && Array.isArray(entry.addresses)
          ? [
              {
                id: entry.id,
                name: String(entry.name ?? ''),
                addresses: entry.addresses.map((address) =>
                  String(address).toLowerCase(),
                ),
                addedAt: Number(entry.addedAt ?? 0),
              },
            ]
          : [],
      )
    : [];

/** How far the person got setting up forwarding, with the banks they forward; null until they start. */
export function startEmailSetupListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (setup: OpenEmailSetup | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption, openJson);
  const stop = onSnapshot(
    doc(db, 'apps', 'runway', 'plans', uid, 'emailSetup', 'progress'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const data = snapshot.exists()
          ? (snapshot.data() as Partial<EmailSetupDoc>)
          : null;
        const payload = data?.sealed
          ? await read<Partial<EmailSetupSealed>>(data.sealed)
          : null;
        if (current !== sequence.latest || run.isStopped) return;
        onChange(
          data === null
            ? null
            : {
                provider: data.provider ?? null,
                stepId: data.stepId ?? null,
                doneAt: data.doneAt ?? null,
                banks: toBanks(payload?.banks),
              },
        );
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
