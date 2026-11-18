import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { PATTERN_LIVE_CAP } from '@apps/helm/constants';
import type { OpenPattern, Pattern, PatternSealed } from '@apps/helm/types';
import { readPrivacy } from '@apps/helm/utils/privacy';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('What Helm noticed did not open.');

/** A pattern whose lines won't open is kept saying nothing, so its answer still holds back what Helm offers. */
export async function openPattern(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenPattern> {
  const data = entry.data() as Partial<Pattern>;
  const base = {
    id: entry.id,
    kind: data.kind ?? 'windowMissed',
    subject: data.subject ?? {
      collection: 'planner' as const,
      id: null,
      windowId: null,
      otherId: null,
    },
    bucket: data.bucket ?? { kind: 'none' as const },
    signature: data.signature ?? '',
    moment: data.moment ?? 'daily',
    state: data.state ?? 'candidate',
    handling: data.handling ?? 'suggest',
    acceptedBy: data.acceptedBy ?? null,
    effect: data.effect ?? { kind: 'none' as const },
    evidence: data.evidence ?? {
      kind: 'occurrences' as const,
      from: 0,
      to: 0,
      matched: 0,
      total: 0,
      dayKeys: [],
    },
    reasons: data.reasons ?? [],
    evidenceSince: data.evidenceSince ?? 0,
    sourceKeys: data.sourceKeys ?? [],
    declineCount: data.declineCount ?? 0,
    nextEligibleOn: data.nextEligibleOn ?? null,
    confirmedAt: data.confirmedAt ?? null,
    offReason: data.offReason ?? null,
    history: data.history ?? [],
    seenAt: data.seenAt ?? null,
    executionId: data.executionId ?? null,
    undoneByExecutionId: data.undoneByExecutionId ?? null,
    isLive: data.isLive ?? true,
    offAt: data.offAt ?? null,
    lastEvidenceAt: data.lastEvidenceAt ?? null,
    privacy: readPrivacy(data.privacy),
    createdAt: data.createdAt ?? 0,
    lastEditedAt: data.lastEditedAt ?? null,
    stateAt: data.stateAt ?? data.createdAt ?? 0,
  } as const;
  try {
    if (!data.sealed) throw new Error('This pattern has no sealed lines.');
    const payload = await read<Partial<PatternSealed>>(data.sealed);
    return {
      ...base,
      statement: payload.statement ?? '',
      evidenceLine: payload.evidenceLine ?? '',
      reasonLine: payload.reasonLine ?? null,
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      statement: '',
      evidenceLine: '',
      reasonLine: null,
      isUnreadable: true,
    };
  }
}

/** The patterns that are neither off nor retired, up to the live cap. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startPatternsListener(
  uid: string,
  read: SealedReader,
  onChange: (patterns: OpenPattern[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'patterns'),
      where('isLive', '==', true),
      limit(PATTERN_LIVE_CAP),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openPattern(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
