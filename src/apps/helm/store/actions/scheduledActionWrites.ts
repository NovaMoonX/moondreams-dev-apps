import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { generateUuid } from '@/utils';
import {
  canRunNow,
  planScheduleChange,
  readSpanPause,
  type ActionState,
  type ChangeRefusal,
  type ScheduleChange,
} from '@apps/helm/engine/scheduledActions';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { sealJson } from '@apps/helm/security';
import type {
  OpenScheduledAction,
  ScheduledActionSealed,
} from '@apps/helm/types';

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);
const actionsOf = (uid: string) => collection(userOf(uid), 'scheduledActions');

export type ScheduledWriteRefusal = ChangeRefusal | 'notNow' | 'gone';

export type ScheduledWrite =
  | { refused: ScheduledWriteRefusal }
  | {
      /** Resolves once the write is committed; it is handed back unawaited so a change works offline. */
      written: Promise<void>;
      /** Puts back only the fields this change wrote, while the action still carries them; 'kept' when something wrote to it since. */
      undo: () => Promise<'undone' | 'kept'>;
      /** The id of the newer half when a change split the action, else null. */
      createdId: string | null;
      /** How many skipped or moved runs no longer fall on a run of the new rule. */
      dropped: number;
    };

type Fields = Record<string, unknown>;

const stamp = (now: number) => ({ scheduledActionsChangedAt: now });

export const toActionState = (action: OpenScheduledAction): ActionState => ({
  status: action.status,
  endedBy: action.endedBy,
  repeat: action.repeat,
  startsOn: action.startsOn,
  time: action.time,
  timeZone: action.timeZone,
  skipped: action.skipped,
  moved: action.moved,
  nextRunAt: action.nextRunAt,
  nextRunKey: action.nextRunKey,
  lastRunDueAt: action.lastRunDueAt,
  pausedFrom: action.pausedFrom,
  pausedUntil: action.pausedUntil,
});

const liveOf = (id: string) =>
  store.getState().helm.scheduledActions.items.find((item) => item.id === id);

const homeZoneOf = () =>
  store.getState().helm.profile?.timeZone ??
  Intl.DateTimeFormat().resolvedOptions().timeZone;

const isSame = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/** Writes `fields` on one action with the profile stamp in the same batch. The Undo puts back the fields it wrote, only while the action still shows them. */
function writeFields(
  uid: string,
  action: OpenScheduledAction,
  fields: Fields,
  now: number,
  extra: { createdId: string | null; dropped: number; split?: Promise<void> },
): ScheduledWrite {
  const ref = doc(actionsOf(uid), action.id);
  const keys = Object.keys(fields) as (keyof OpenScheduledAction)[];
  const before = Object.fromEntries(keys.map((key) => [key, action[key]]));
  const batch = writeBatch(db);
  batch.update(ref, { ...fields, lastEditedAt: now });
  batch.update(userOf(uid), stamp(now));
  const written = (extra.split ?? Promise.resolve()).then(() => batch.commit());
  return {
    written,
    createdId: extra.createdId,
    dropped: extra.dropped,
    undo: async () => {
      const live = liveOf(action.id);
      if (!live || !keys.every((key) => isSame(live[key], fields[key])))
        return 'kept';
      const undoNow = Date.now();
      const undoBatch = writeBatch(db);
      undoBatch.update(ref, { ...before, lastEditedAt: undoNow });
      undoBatch.update(userOf(uid), stamp(undoNow));
      await undoBatch.commit();
      if (extra.createdId)
        await deleteDoc(doc(actionsOf(uid), extra.createdId));
      return 'undone';
    },
  };
}

/** The newer half of a split: the same words and kind, its own rule, no history of runs. Sealed again so the document carries its own copy. */
async function writeSplit(
  uid: string,
  action: OpenScheduledAction,
  created: ActionState,
  id: string,
  now: number,
) {
  const encryption = await getHelmEncryption(uid);
  const words: ScheduledActionSealed = {
    title: action.title,
    instruction: action.instruction,
    heldCommands: action.heldCommands,
  };
  await setDoc(doc(actionsOf(uid), id), {
    status: 'active',
    endedBy: null,
    repeat: created.repeat,
    startsOn: created.startsOn,
    time: created.time,
    timeZone: created.timeZone,
    skipped: created.skipped,
    moved: created.moved,
    nextRunAt: created.nextRunAt,
    nextRunKey: created.nextRunKey,
    splitFromId: action.id,
    kind: action.kind,
    allowed: action.allowed,
    needsApproval: action.needsApproval,
    lastRunAt: null,
    lastRunCaptureId: null,
    lastRunDueAt: null,
    lastOutcome: null,
    lastFailReason: null,
    pausedFrom: created.pausedFrom,
    pausedUntil: created.pausedUntil,
    runNowAt: null,
    createdBy: 'person',
    sourceCaptureId: action.sourceCaptureId,
    createdAt: now,
    lastEditedAt: null,
    sealed: await sealJson<ScheduledActionSealed>(words, encryption),
  });
}

/** Plans one change with the shared engine and writes it: skip, move, pause, resume, end or "this and following". Splitting needs a connection to seal the newer half. */
export function changeScheduledAction(
  uid: string,
  id: string,
  change: ScheduleChange,
): ScheduledWrite {
  const action = liveOf(id);
  if (!action) return { refused: 'gone' };
  const now = Date.now();
  const planned = planScheduleChange(toActionState(action), change, {
    homeZone: homeZoneOf(),
    now,
  });
  if ('refused' in planned) return { refused: planned.refused };
  const createdId = planned.created ? generateUuid() : null;
  return writeFields(uid, action, planned.fields as Fields, now, {
    createdId,
    dropped: planned.dropped,
    split:
      planned.created && createdId
        ? writeSplit(uid, action, planned.created, createdId, now)
        : undefined,
  });
}

export const pauseScheduledAction = (uid: string, id: string) =>
  changeScheduledAction(uid, id, { kind: 'pause' });

export const resumeScheduledAction = (uid: string, id: string) =>
  changeScheduledAction(uid, id, { kind: 'resume' });

export const endScheduledAction = (uid: string, id: string) =>
  changeScheduledAction(uid, id, { kind: 'end' });

/** Skips one run; `key` null is the next one. */
export const skipScheduledRun = (uid: string, id: string, key: string | null) =>
  changeScheduledAction(uid, id, { kind: 'skip', key });

/** Moves one run to `day` (a day key) and optionally another time, today or later and before the run after it, never onto a day that ran. */
export const moveScheduledRun = (
  uid: string,
  id: string,
  move: { key: string | null; day: string; time: string | null },
) => changeScheduledAction(uid, id, { kind: 'move', ...move });

/** "Pause what runs at home" for a time-away span (day keys, inclusive): every action with a run in the span waits it out. A span that moves the person to another zone never moves an action; only a new home does, for actions with no zone of their own. */
export function pauseScheduledActionsForSpan(
  uid: string,
  span: { fromDay: string; toDay: string },
): { paused: number; written: Promise<void>; undo: () => Promise<void> } {
  const now = Date.now();
  const homeZone = homeZoneOf();
  const changes = store
    .getState()
    .helm.scheduledActions.items.flatMap((action) => {
      if (action.status !== 'active' || action.isUnreadable) return [];
      const pause = readSpanPause(toActionState(action), homeZone, span, now);
      return pause ? [{ action, pause }] : [];
    });
  const batch = writeBatch(db);
  changes.forEach(({ action, pause }) =>
    batch.update(doc(actionsOf(uid), action.id), {
      ...pause,
      lastEditedAt: now,
    }),
  );
  if (changes.length > 0) batch.update(userOf(uid), stamp(now));
  return {
    paused: changes.length,
    written: changes.length > 0 ? batch.commit() : Promise.resolve(),
    undo: async () => {
      if (changes.length === 0) return;
      const undoNow = Date.now();
      const undoBatch = writeBatch(db);
      changes.forEach(({ action }) =>
        undoBatch.update(doc(actionsOf(uid), action.id), {
          pausedFrom: action.pausedFrom,
          pausedUntil: action.pausedUntil,
          lastEditedAt: undoNow,
        }),
      );
      undoBatch.update(userOf(uid), stamp(undoNow));
      await undoBatch.commit();
    },
  };
}

/** Run it now, only after a run that couldn't go and before the action's next scheduled run: stamps a request the server reads on its next pass (within five minutes) and clears. */
export function runScheduledActionNow(uid: string, id: string) {
  const action = liveOf(id);
  if (!action) return { refused: 'gone' as const };
  const now = Date.now();
  if (
    !canRunNow({
      status: action.status,
      lastOutcome: action.lastOutcome,
      nextRunAt: action.nextRunAt,
      now,
    })
  )
    return { refused: 'notNow' as const };
  const batch = writeBatch(db);
  batch.update(doc(actionsOf(uid), id), { runNowAt: now });
  batch.update(userOf(uid), stamp(now));
  return { written: batch.commit() };
}

/** On open, when any action is waiting on the person's limits, stamps the profile so the server tries it again. Says whether it wrote. */
export function stampWaitingScheduledActions(uid: string, now: number) {
  const state = store.getState().helm;
  const hasWaiting = state.scheduledActions.items.some(
    (action) => action.lastOutcome === 'waiting' && action.status === 'active',
  );
  const stamped = state.profile?.scheduledActionsChangedAt ?? 0;
  if (!hasWaiting || now - stamped < 60_000) return Promise.resolve(false);
  return writeBatch(db)
    .update(userOf(uid), stamp(now))
    .commit()
    .then(() => true);
}
