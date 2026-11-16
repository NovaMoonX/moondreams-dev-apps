import { collection, doc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { generateUuid } from '@/utils';
import { dayKeyToMs, msToDayKey } from '@/utils/cadenceUtils';
import type { RepeatCapError, RepeatRule } from '@/utils/repeatRule';
import { HELM_CAPS } from '@apps/helm/constants';
import {
  buildScheduleRule,
  canRunNow,
  planScheduleChange,
  readNextRun,
  readSpanPause,
  toDayKeyIn,
  type ActionState,
  type ChangeRefusal,
  type RunSchedule,
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

/** The command kinds an action the person makes by hand may write: Helm's own, never one that leaves it. */
const OWN_KINDS = ['createTask', 'updateTask', 'planDay'];

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
  pausedForSpanId: action.pausedForSpanId,
});

const liveOf = (id: string) =>
  store.getState().helm.scheduledActions.items.find((item) => item.id === id);

const homeZoneOf = () =>
  store.getState().helm.profile?.timeZone ??
  Intl.DateTimeFormat().resolvedOptions().timeZone;

const sortKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => (left < right ? -1 : 1))
            .map(([key, one]) => [key, sortKeys(one)]),
        )
      : value;

const isSame = (left: unknown, right: unknown) =>
  JSON.stringify(sortKeys(left)) === JSON.stringify(sortKeys(right));

interface SplitInput {
  created: ActionState;
  id: string;
  /** The words the newer half carries; the older half's own when the person edited none. */
  words: ScheduledActionSealed;
}

/** The newer half of a split: its own rule and no history of runs, sealed so the document carries its own copy of the words. */
async function buildSplit(
  uid: string,
  action: OpenScheduledAction,
  split: SplitInput,
  now: number,
) {
  const { created } = split;
  const encryption = await getHelmEncryption(uid);
  return {
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
    pausedForSpanId: created.pausedForSpanId,
    runNowAt: null,
    createdBy: 'person',
    sourceCaptureId: action.sourceCaptureId,
    createdAt: now,
    lastEditedAt: null,
    sealed: await sealJson<ScheduledActionSealed>(split.words, encryption),
  };
}

/** Writes `fields` on one action with the profile stamp in the same batch; a split writes its newer half in that batch too. The Undo puts back the fields it wrote, only while the action still shows them. */
function writeFields(
  uid: string,
  action: OpenScheduledAction,
  fields: Fields,
  now: number,
  extra: { createdId: string | null; dropped: number; split?: SplitInput },
): ScheduledWrite {
  const ref = doc(actionsOf(uid), action.id);
  const keys = Object.keys(fields) as (keyof OpenScheduledAction)[];
  const before = Object.fromEntries(keys.map((key) => [key, action[key]]));
  const commit = async () => {
    const batch = writeBatch(db);
    if (extra.split)
      batch.set(
        doc(actionsOf(uid), extra.split.id),
        await buildSplit(uid, action, extra.split, now),
      );
    batch.update(ref, { ...fields, lastEditedAt: now });
    batch.update(userOf(uid), stamp(now));
    await batch.commit();
  };
  const written = commit();
  return {
    written,
    createdId: extra.createdId,
    dropped: extra.dropped,
    undo: async () => {
      // An offline commit never resolves; only a split's newer half must exist before it can be removed.
      if (extra.split) await written;
      const live = liveOf(action.id);
      if (!live || !keys.every((key) => isSame(live[key], fields[key])))
        return 'kept';
      const undoNow = Date.now();
      const undoBatch = writeBatch(db);
      undoBatch.update(ref, { ...before, lastEditedAt: undoNow });
      if (extra.createdId)
        undoBatch.delete(doc(actionsOf(uid), extra.createdId));
      undoBatch.update(userOf(uid), stamp(undoNow));
      await undoBatch.commit();
      return 'undone';
    },
  };
}

/** Plans one change with the shared engine and writes it: skip, move, pause, resume, end or "this and following". Splitting needs a connection to seal the newer half, which carries `options.words` when the person edited them. */
export function changeScheduledAction(
  uid: string,
  id: string,
  change: ScheduleChange,
  options: { words?: { title: string; instruction: string | null } } = {},
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
        ? {
            created: planned.created,
            id: createdId,
            words: {
              title: options.words?.title ?? action.title,
              instruction: options.words
                ? options.words.instruction
                : action.instruction,
              heldCommands: action.heldCommands,
            },
          }
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

interface PausePlan {
  action: OpenScheduledAction;
  fields: Fields | null;
}

/** "Pause what runs at home" for a time-away span (day keys, inclusive): every action with a run in the span waits it out, and one already paused on other days keeps running (`kept` counts those). A span that moves the person to another zone never moves an action; only a new home does, for actions with no zone of their own. */
export function pauseScheduledActionsForSpan(
  uid: string,
  span: { awayId: string; fromDay: string; toDay: string },
): { paused: number; kept: number; written: Promise<void> } {
  const now = Date.now();
  const homeZone = homeZoneOf();
  const planned = store
    .getState()
    .helm.scheduledActions.items.flatMap((action): PausePlan[] => {
      if (action.status !== 'active' || action.isUnreadable) return [];
      const state = toActionState(action);
      const pause = readSpanPause(state, homeZone, span, now);
      if (!pause) return [];
      if ('clash' in pause) return [{ action, fields: null }];
      const next = readNextRun({ ...state, ...pause }, homeZone, { now });
      return [
        {
          action,
          fields: {
            ...pause,
            pausedForSpanId: span.awayId,
            nextRunAt: next?.at ?? null,
            nextRunKey: next?.key ?? null,
          },
        },
      ];
    });
  const changes = planned.flatMap(({ action, fields }) =>
    fields ? [{ action, fields }] : [],
  );
  const batch = writeBatch(db);
  changes.forEach(({ action, fields }) =>
    batch.update(doc(actionsOf(uid), action.id), {
      ...fields,
      lastEditedAt: now,
    }),
  );
  if (changes.length > 0) batch.update(userOf(uid), stamp(now));
  return {
    paused: changes.length,
    kept: planned.length - changes.length,
    written: changes.length > 0 ? batch.commit() : Promise.resolve(),
  };
}

/** Takes a span's pause off the actions it paused, read from what is stored so it works after a reload and for actions made during the span; one whose pause was changed since stays as it is (`notPutBack` counts those). */
export async function unpauseScheduledActionsForSpan(
  uid: string,
  span: { awayId: string; fromDay: string; toDay: string },
): Promise<{ notPutBack: number }> {
  const now = Date.now();
  const homeZone = homeZoneOf();
  const carrying = store
    .getState()
    .helm.scheduledActions.items.filter(
      (action) => action.pausedForSpanId === span.awayId,
    );
  const matching = carrying.filter(
    (action) =>
      action.pausedFrom === dayKeyToMs(span.fromDay) &&
      action.pausedUntil === dayKeyToMs(span.toDay),
  );
  const batch = writeBatch(db);
  matching.forEach((action) => {
    const next =
      action.status === 'active'
        ? readNextRun(
            {
              ...toActionState(action),
              pausedFrom: null,
              pausedUntil: null,
            },
            homeZone,
            { now },
          )
        : null;
    batch.update(doc(actionsOf(uid), action.id), {
      pausedFrom: null,
      pausedUntil: null,
      pausedForSpanId: null,
      ...(action.status === 'active'
        ? { nextRunAt: next?.at ?? null, nextRunKey: next?.key ?? null }
        : {}),
      lastEditedAt: now,
    });
  });
  if (matching.length > 0) {
    batch.update(userOf(uid), stamp(now));
    await batch.commit();
  }
  return { notPutBack: carrying.length - matching.length };
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

/** The first marked time-away span (still going or ahead) with a run of `schedule` inside it, as the pause that span asks for. */
const readMarkedSpanPause = (
  schedule: RunSchedule,
  homeZone: string,
  now: number,
) => {
  const today = toDayKeyIn(now, homeZone);
  const self = store.getState().helm.who.items.find((who) => who.isSelf);
  return (
    (self?.away ?? [])
      .filter(
        (span) => span.pausesScheduled === true && msToDayKey(span.to) >= today,
      )
      .flatMap((span) => {
        const pause = readSpanPause(
          schedule,
          homeZone,
          { fromDay: msToDayKey(span.from), toDay: msToDayKey(span.to) },
          now,
        );
        return pause && !('clash' in pause)
          ? [{ ...pause, pausedForSpanId: span.id }]
          : [];
      })[0] ?? null
  );
};

export type ScheduledCreateRefusal =
  RepeatCapError | 'full' | 'neverComes' | 'words';

export interface ScheduledCreateInput {
  title: string;
  instruction: string | null;
  rule: RepeatRule | null;
  startsOn: string;
  time: string;
}

/** Makes an action by hand from Browse. It runs as a turn with the person's words and may only write Helm's own kinds; a time away marked "pause what runs at home" holds it too. Undo deletes it. */
export function createScheduledAction(
  uid: string,
  input: ScheduledCreateInput,
):
  | { refused: ScheduledCreateRefusal }
  | { written: Promise<void>; undo: () => Promise<void>; createdId: string } {
  const now = Date.now();
  const homeZone = homeZoneOf();
  const title = input.title.trim();
  const instruction = input.instruction?.trim() || null;
  if (!title || !instruction) return { refused: 'words' };
  const kept = store
    .getState()
    .helm.scheduledActions.items.filter(
      (action) => action.status !== 'ended',
    ).length;
  if (kept >= HELM_CAPS.scheduledActions) return { refused: 'full' };
  const built = buildScheduleRule(
    input.rule,
    input.startsOn,
    toDayKeyIn(now, homeZone),
  );
  if ('error' in built) return { refused: built.error };
  const unpaused: RunSchedule = {
    repeat: built.repeat,
    startsOn: input.startsOn,
    time: input.time,
    timeZone: null,
    skipped: [],
    moved: {},
    pausedFrom: null,
    pausedUntil: null,
  };
  const pause = readMarkedSpanPause(unpaused, homeZone, now);
  const schedule: RunSchedule = { ...unpaused, ...pause };
  const first = readNextRun(schedule, homeZone, { now });
  if (!first) return { refused: 'neverComes' };
  const id = generateUuid();
  const words: ScheduledActionSealed = {
    title,
    instruction,
    heldCommands: null,
  };
  const written = (async () => {
    const encryption = await getHelmEncryption(uid);
    const batch = writeBatch(db);
    batch.set(doc(actionsOf(uid), id), {
      status: 'active',
      endedBy: null,
      ...schedule,
      pausedForSpanId: pause?.pausedForSpanId ?? null,
      nextRunAt: first.at,
      nextRunKey: first.key,
      splitFromId: null,
      kind: 'prompt',
      allowed: OWN_KINDS,
      needsApproval: false,
      lastRunAt: null,
      lastRunCaptureId: null,
      lastRunDueAt: null,
      lastOutcome: null,
      lastFailReason: null,
      runNowAt: null,
      createdBy: 'person',
      sourceCaptureId: null,
      createdAt: now,
      lastEditedAt: null,
      sealed: await sealJson<ScheduledActionSealed>(words, encryption),
    });
    batch.update(userOf(uid), stamp(now));
    await batch.commit();
  })();
  return {
    written,
    createdId: id,
    undo: async () => {
      await written;
      const undoBatch = writeBatch(db);
      undoBatch.delete(doc(actionsOf(uid), id));
      undoBatch.update(userOf(uid), stamp(Date.now()));
      await undoBatch.commit();
    },
  };
}

/** "Until a day you pick": every run from today to that day (a day key, inclusive) waits, the action stays active; it replaces any pause the action had. */
export function pauseScheduledActionUntil(
  uid: string,
  id: string,
  toDay: string,
): ScheduledWrite {
  const action = liveOf(id);
  if (!action) return { refused: 'gone' };
  if (action.status === 'ended') return { refused: 'ended' };
  const now = Date.now();
  const homeZone = homeZoneOf();
  const state: ActionState = {
    ...toActionState(action),
    pausedFrom: null,
    pausedUntil: null,
    pausedForSpanId: null,
  };
  const today = toDayKeyIn(now, state.timeZone ?? homeZone);
  const pause = readSpanPause(state, homeZone, { fromDay: today, toDay }, now);
  if (!pause || 'clash' in pause) return { refused: 'noRun' };
  const next = readNextRun({ ...state, ...pause }, homeZone, { now });
  if (!next) return { refused: 'neverComes' };
  return writeFields(
    uid,
    action,
    {
      ...pause,
      pausedForSpanId: null,
      nextRunAt: next.at,
      nextRunKey: next.key,
    },
    now,
    { createdId: null, dropped: 0 },
  );
}

/** Changes what an action is called and what it does; Undo puts the earlier words back while these are still the ones shown. */
export function changeScheduledWords(
  uid: string,
  id: string,
  words: { title: string; instruction: string | null },
): ScheduledWrite {
  const action = liveOf(id);
  if (!action) return { refused: 'gone' };
  if (action.status === 'ended') return { refused: 'ended' };
  const writeWords = async (next: ScheduledActionSealed) => {
    const at = Date.now();
    const encryption = await getHelmEncryption(uid);
    const batch = writeBatch(db);
    batch.update(doc(actionsOf(uid), id), {
      sealed: await sealJson<ScheduledActionSealed>(next, encryption),
      lastEditedAt: at,
    });
    batch.update(userOf(uid), stamp(at));
    await batch.commit();
  };
  const before: ScheduledActionSealed = {
    title: action.title,
    instruction: action.instruction,
    heldCommands: action.heldCommands,
  };
  return {
    written: writeWords({ ...before, ...words }),
    createdId: null,
    dropped: 0,
    undo: async () => {
      const live = liveOf(id);
      if (
        !live ||
        live.title !== words.title ||
        live.instruction !== words.instruction
      )
        return 'kept';
      await writeWords(before);
      return 'undone';
    },
  };
}

/** Takes a skip or a move off one run (a day key), so it runs as the rule says. */
export function restoreScheduledRun(
  uid: string,
  id: string,
  key: string,
): ScheduledWrite {
  const action = liveOf(id);
  if (!action) return { refused: 'gone' };
  if (action.status === 'ended') return { refused: 'ended' };
  const now = Date.now();
  const state = toActionState(action);
  const restored: ActionState = {
    ...state,
    skipped: state.skipped.filter((one) => one !== key),
    moved: Object.fromEntries(
      Object.entries(state.moved).filter(([one]) => one !== key),
    ),
  };
  const next =
    action.status === 'active'
      ? readNextRun(restored, homeZoneOf(), { now })
      : null;
  return writeFields(
    uid,
    action,
    {
      skipped: restored.skipped,
      moved: restored.moved,
      ...(action.status === 'active'
        ? { nextRunAt: next?.at ?? null, nextRunKey: next?.key ?? null }
        : {}),
    },
    now,
    { createdId: null, dropped: 0 },
  );
}
