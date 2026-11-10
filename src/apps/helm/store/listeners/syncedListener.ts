import {
  collection,
  limit,
  onSnapshot,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { SYNCED_LIMIT } from '@apps/helm/constants';
import type { SyncedContent, SyncedRecord, SharedKind } from '@apps/helm/types';

const toError = (error: unknown) =>
  error instanceof Error
    ? error
    : new Error('Your synced things did not open.');

const text = (value: unknown) => (typeof value === 'string' ? value : null);
const number = (value: unknown) => (typeof value === 'number' ? value : null);

/** A copy that won't open is left out: with no words there is nothing to show. */
async function openSynced(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<SyncedRecord[]> {
  const data = entry.data() as Partial<SyncedRecord> & { sealed?: never };
  const sealed = entry.get('sealed') as Parameters<SealedReader>[0] | undefined;
  if (!sealed) return [];
  try {
    const content = await read<Partial<SyncedContent>>(sealed);
    if (typeof content.title !== 'string') return [];
    return [
      {
        id: entry.id,
        connectorId: data.connectorId ?? '',
        accountId: data.accountId ?? '',
        grantId: data.grantId ?? '',
        category: data.category ?? '',
        kind: (data.kind ?? 'event') as SharedKind,
        sourceRef: data.sourceRef ?? '',
        startAt: data.startAt ?? null,
        endAt: data.endAt ?? null,
        isAllDay: data.isAllDay ?? false,
        dueAt: data.dueAt ?? null,
        calendarKey: data.calendarKey ?? null,
        isBusy: data.isBusy ?? null,
        sourceUpdatedAt: data.sourceUpdatedAt ?? null,
        syncedAt: data.syncedAt ?? 0,
        transformVersion: data.transformVersion ?? 0,
        connectionEndedAt: data.connectionEndedAt ?? null,
        deleteAfter: data.deleteAfter ?? null,
        sealed: {
          title: content.title,
          subtitle: text(content.subtitle),
          detail: text(content.detail),
          placeLabel: text(content.placeLabel),
          amountCents: number(content.amountCents),
          currency: text(content.currency),
          deepLink: text(content.deepLink),
          extra: content.extra ?? {},
        },
      },
    ];
  } catch {
    return [];
  }
}

/** The person's synced copies. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startSyncedListener(
  uid: string,
  read: SealedReader,
  onChange: (records: SyncedRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'synced'),
      limit(SYNCED_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openSynced(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened.flat());
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
