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

import { HELM_CAPS } from '@apps/helm/constants';
import type {
  OpenScheduledAction,
  ScheduledAction,
  ScheduledActionSealed,
} from '@apps/helm/types';

const toError = (error: unknown) =>
  error instanceof Error
    ? error
    : new Error('Your scheduled actions did not open.');

const OUTCOMES = ['done', 'needsYou', 'failed', 'skipped', 'waiting'] as const;
const REASONS = [
  'notConnected',
  'grantExpired',
  'notAllowed',
  'runFailed',
  'ruleInvalid',
] as const;

const numberOrNull = (value: unknown) =>
  typeof value === 'number' ? value : null;
const stringOrNull = (value: unknown) =>
  typeof value === 'string' ? value : null;

/** An action that won't open is kept, with no words, so a screen never draws it but a count still sees it. */
async function openAction(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenScheduledAction> {
  const data = entry.data() as Partial<ScheduledAction>;
  const base: Omit<OpenScheduledAction, keyof ScheduledActionSealed> = {
    id: entry.id,
    status:
      data.status === 'paused' || data.status === 'ended'
        ? data.status
        : 'active',
    endedBy:
      data.endedBy === 'person' || data.endedBy === 'finished'
        ? data.endedBy
        : null,
    repeat: stringOrNull(data.repeat),
    startsOn: stringOrNull(data.startsOn) ?? '',
    time: stringOrNull(data.time) ?? '09:00',
    timeZone: stringOrNull(data.timeZone),
    skipped: Array.isArray(data.skipped) ? data.skipped : [],
    moved: data.moved ?? {},
    nextRunAt: numberOrNull(data.nextRunAt),
    nextRunKey: stringOrNull(data.nextRunKey),
    splitFromId: stringOrNull(data.splitFromId),
    kind: data.kind === 'prompt' ? 'prompt' : 'commands',
    allowed: Array.isArray(data.allowed) ? data.allowed : [],
    needsApproval: data.needsApproval === true,
    lastRunAt: numberOrNull(data.lastRunAt),
    lastRunCaptureId: stringOrNull(data.lastRunCaptureId),
    lastRunDueAt: numberOrNull(data.lastRunDueAt),
    lastOutcome: OUTCOMES.find((one) => one === data.lastOutcome) ?? null,
    lastFailReason: REASONS.find((one) => one === data.lastFailReason) ?? null,
    pausedFrom: numberOrNull(data.pausedFrom),
    pausedUntil: numberOrNull(data.pausedUntil),
    runNowAt: numberOrNull(data.runNowAt),
    createdBy: data.createdBy === 'person' ? 'person' : 'nomos',
    sourceCaptureId: stringOrNull(data.sourceCaptureId),
    createdAt: data.createdAt ?? 0,
    lastEditedAt: numberOrNull(data.lastEditedAt),
    isUnreadable: false,
  };
  try {
    if (!data.sealed) throw new Error('This action has no sealed words.');
    const payload = await read<Partial<ScheduledActionSealed>>(data.sealed);
    return {
      ...base,
      title: typeof payload.title === 'string' ? payload.title : '',
      instruction: stringOrNull(payload.instruction),
      heldCommands: Array.isArray(payload.heldCommands)
        ? payload.heldCommands
        : null,
    };
  } catch {
    return {
      ...base,
      title: '',
      instruction: null,
      heldCommands: null,
      isUnreadable: true,
    };
  }
}

/** Every scheduled action, ended ones included. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startScheduledActionsListener(
  uid: string,
  read: SealedReader,
  onChange: (actions: OpenScheduledAction[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'scheduledActions'),
      limit(HELM_CAPS.scheduledActions + 1),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openAction(entry, read)),
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
