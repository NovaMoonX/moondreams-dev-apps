import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Query,
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
    pausedForSpanId: stringOrNull(data.pausedForSpanId),
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

const ENDED_SHOWN = 20;

/** The active and paused actions, and the last few the person ended for the Ended fold; ended ones are never deleted, so only these two bounded reads are made. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startScheduledActionsListener(
  uid: string,
  read: SealedReader,
  onChange: (actions: OpenScheduledAction[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const parts = {
    live: null as OpenScheduledAction[] | null,
    ended: [] as OpenScheduledAction[],
  };
  const sequence = { live: 0, ended: 0 };
  const run = { isStopped: false };
  const actions = collection(
    db,
    'apps',
    'helm',
    'users',
    uid,
    'scheduledActions',
  );

  const emit = () => {
    if (!parts.live) return;
    const byId = new Map<string, OpenScheduledAction>();
    [...parts.live, ...parts.ended].forEach((action) => {
      const held = byId.get(action.id);
      if (!held || (action.lastEditedAt ?? 0) > (held.lastEditedAt ?? 0))
        byId.set(action.id, action);
    });
    onChange(Array.from(byId.values()));
  };

  const listen = (
    part: 'live' | 'ended',
    source: Query,
    handleError: (error: unknown) => void,
  ) =>
    onSnapshot(
      source,
      async (snapshot) => {
        sequence[part] += 1;
        const current = sequence[part];
        const opened = await Promise.all(
          snapshot.docs.map((entry) => openAction(entry, read)),
        );
        if (current !== sequence[part] || run.isStopped) return;
        parts[part] = opened;
        emit();
      },
      handleError,
    );

  const stopLive = listen(
    'live',
    query(
      actions,
      where('status', 'in', ['active', 'paused']),
      limit(HELM_CAPS.scheduledActions + 1),
    ),
    (error) => onError(toError(error)),
  );
  const stopEnded = listen(
    'ended',
    query(
      actions,
      where('endedBy', '==', 'person'),
      orderBy('lastEditedAt', 'desc'),
      limit(ENDED_SHOWN),
    ),
    (error) => console.error('Helm ended actions did not open', error),
  );

  return () => {
    run.isStopped = true;
    stopLive();
    stopEnded();
  };
}
