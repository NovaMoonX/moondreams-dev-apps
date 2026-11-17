import { CLAIM_MS, HELM_COPY } from '@apps/helm/constants';
import { CURRENT_PLACE_MS } from '@apps/helm/engine/currentPlace';
import { LET_GO_WINDOW_MS } from '@apps/helm/utils/mediaCaps';
import { ALL_KEY_KINDS, MOMENT_PRECISIONS } from '@apps/helm/utils/moments';
import {
  buildUndoUnits,
  getRemainingUnits,
  topicEffectKind,
  type TopicEffectKind,
} from '@apps/helm/utils/undoUnits';
import type {
  EffectRef,
  Execution,
  ExecutionEffect,
  ConnectionSealed,
  ExecutionSealed,
  HabitDaySealed,
  HabitSealed,
  KeyDateSealed,
  NoteSealed,
  OpenExecution,
  ProjectSealed,
  ResearchSealed,
  SeenAsSealed,
  TaskSealed,
  ProcedureSealed,
  RunSealed,
  TopicSealed,
  UndoChoice,
  UndoReasonRecord,
  WhoSealed,
} from '@apps/helm/types';

export { topicEffectKind };
export type { TopicEffectKind };

/** The undo fields of an execution document, with the ones a document from before partial undo lacks filled in. */
export const readUndoFields = (
  data: Partial<
    Pick<Execution, 'undoneByExecutionId' | 'undoneDocIds' | 'partUndoIds'>
  >,
) => ({
  undoneDocIds: data.undoneDocIds ?? [],
  partUndoIds:
    data.partUndoIds ??
    (data.undoneByExecutionId ? [data.undoneByExecutionId] : []),
});

/** The records of an execution that an Undo already took back: all of them once it was fully undone, else the ones partial undos recorded. */
export const getUndoneDocIds = (
  execution: Pick<
    OpenExecution,
    'effectRefs' | 'undoneByExecutionId' | 'undoneDocIds'
  >,
) =>
  new Set(
    execution.undoneByExecutionId !== null
      ? execution.effectRefs.map((ref) => ref.docId)
      : execution.undoneDocIds,
  );

/** Whether an Undo is offered: a readable, succeeded execution that is not itself an Undo, not yet undone, and still has something to take back. */
export const canUndo = (execution: OpenExecution) => {
  if (
    execution.isUnreadable ||
    execution.state !== 'succeeded' ||
    execution.category === 'undo' ||
    execution.undoneByExecutionId !== null ||
    execution.effectRefs.length === 0
  ) {
    return false;
  }
  const { units } = buildUndoUnits(execution);
  return (
    units.length === 0 ||
    getRemainingUnits(units, getUndoneDocIds(execution)).length > 0
  );
};

export interface UndoTarget {
  docId: string;
  /** The document as it is now; null when it is gone. */
  data: Record<string, unknown> | null;
  /** Its sealed words; null when they won't open. */
  opened:
    | TaskSealed
    | WhoSealed
    | KeyDateSealed
    | ProjectSealed
    | HabitSealed
    | HabitDaySealed
    | NoteSealed
    | TopicSealed
    | ProcedureSealed
    | RunSealed
    | ConnectionSealed
    | ResearchSealed
    | SeenAsSealed
    | null;
  /** For a date that was removed: whether the person it belonged to is still there; for a topic that was moved: whether its old parent is. */
  isOwnerHere?: boolean;
}

export type UndoRefusal =
  'alreadyUndone' | 'notUndoable' | 'nothingToTakeBack' | 'unreadable';

export type UndoPlan =
  | {
      kind: 'write';
      deletes: { docId: string; collection: EffectRef['collection'] }[];
      updates: {
        docId: string;
        fields: Record<string, unknown>;
        collection: EffectRef['collection'];
        reseal:
          | TaskSealed
          | WhoSealed
          | KeyDateSealed
          | ProjectSealed
          | HabitSealed
          | HabitDaySealed
          | ConnectionSealed
          | ResearchSealed
          | SeenAsSealed
          | null;
      }[];
      /** Topics and procedures whose document goes back to an earlier version, written as a new version `from + 1` holding the parts of `to`. */
      versionRestores: {
        docId: string;
        collection: 'topics' | 'procedures';
        from: number;
        to: number;
      }[];
      /** Dates the assistant removed, written back under the same ids. */
      creates: {
        docId: string;
        collection: EffectRef['collection'];
        fields: Values;
        seal: KeyDateSealed | ConnectionSealed;
      }[];
      undoExecution: Omit<Execution, 'sealed'>;
      undoSealed: ExecutionSealed;
      takenBack: string[];
      kept: string[];
      gone: number;
      goneIds: string[];
      report: string;
    }
  | {
      kind: 'refused';
      reason: UndoRefusal;
      kept: string[];
      report: string | null;
    };

type Values = Record<string, unknown>;

const SEALED_PREFIX = 'sealed.';

/** An undo reads every record in one transaction. A turn's commands are capped at 40 and it then adds the people, places, home and photos they name; an import of 50 people with their photos is the largest. */
export const MAX_UNDO_EFFECTS = 80;
const MAX_IMPORT_EFFECTS = 120;

const isSame = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => isSame(value, b[index]))
    );
  }
  const left = a as Values;
  const right = b as Values;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => key in right && isSame(left[key], right[key]))
  );
};

const refuse = (
  reason: UndoRefusal,
  kept: string[] = [],
  report: string | null = null,
): UndoPlan => ({ kind: 'refused', reason, kept, report });

interface Step {
  data: Values | null;
  opened: UndoTarget['opened'];
  fields: Values;
  sealedFields: Values;
  restored: Values;
  current: Values;
  isKept: boolean;
  /** A milestone the turn added was changed since, so it is left where it is. */
  hasKeptEntry: boolean;
}

type RecordOutcome =
  | { kind: 'gone' }
  | { kind: 'kept'; title: string }
  | { kind: 'skipped' }
  | {
      kind: 'versionBack';
      title: string;
      from: number;
      to: number;
      effect: ExecutionEffect;
    }
  | { kind: 'deleted'; title: string; effect: ExecutionEffect }
  | {
      kind: 'restored';
      title: string;
      fields: Values;
      reseal:
        | TaskSealed
        | WhoSealed
        | KeyDateSealed
        | ProjectSealed
        | HabitSealed
        | HabitDaySealed
        | ConnectionSealed
        | ResearchSealed
        | SeenAsSealed
        | null;
      effect: ExecutionEffect;
    }
  | {
      kind: 'recreated';
      title: string;
      fields: Values;
      seal: KeyDateSealed | ConnectionSealed;
      effect: ExecutionEffect;
    };

const toOpenedTitle = (opened: UndoTarget['opened']) =>
  opened === null
    ? ''
    : 'title' in opened
      ? opened.title
      : 'name' in opened
        ? opened.name
        : '';

const toText = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null;

const toTitle = (target: UndoTarget, effects: ExecutionEffect[]) =>
  toOpenedTitle(target.opened) ||
  effects
    .map(
      (effect) =>
        effect.written['sealed.title'] ?? effect.written['sealed.name'],
    )
    .find((title): title is string => typeof title === 'string' && !!title) ||
  HELM_COPY.resultTaskFallback;

const toCollectionOf = (original: OpenExecution) =>
  new Map(original.effectRefs.map((ref) => [ref.docId, ref.collection]));

/** Applies one update effect to the working copy; a path it didn't change (written equals previous) is a label and is neither compared nor restored. */
const isStillHome = (value: unknown, now: number) =>
  typeof value === 'object' &&
  value !== null &&
  'saidAt' in value &&
  typeof value.saidAt === 'number' &&
  now - value.saidAt < CURRENT_PLACE_MS;

const MILESTONE_PATHS = ['milestoneState.', 'sealed.milestones.'];

/** A milestone an effect wrote is one entry under a dotted path, so Undo compares and restores that entry alone. */
const isMilestonePath = (path: string) =>
  MILESTONE_PATHS.some((prefix) => path.startsWith(prefix));

const readPath = (source: Values | null, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        typeof value === 'object' && value !== null
          ? (value as Values)[key]
          : undefined,
      source,
    );

/** Sets one path on a copy; a null written to a nested path takes the entry away. */
const writePath = (source: Values, path: string, value: unknown): Values => {
  const [head, ...rest] = path.split('.');
  if (rest.length === 0) return { ...source, [head]: value };
  const inner = (source[head] ?? {}) as Values;
  if (rest.length === 1 && value === null) {
    return {
      ...source,
      [head]: Object.fromEntries(
        Object.entries(inner).filter(([key]) => key !== rest[0]),
      ),
    };
  }
  return { ...source, [head]: writePath(inner, rest.join('.'), value) };
};

const writePaths = (
  source: Values,
  paths: string[],
  values: Values,
  toPath: (path: string) => string,
) =>
  paths.reduce(
    (copy, path) => writePath(copy, toPath(path), values[path]),
    source,
  );

const OFFERS_PATH = 'researchOffers';
const ASKS_PATH = 'sealed.aheadAsks';

const toEntries = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Values & { id: string } =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as Values).id === 'string',
      )
    : [];

const toKeyed = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Values)
    : null;

/** Offers the turn added, by id: the device stamps a seen day on them, so only what the person answered keeps one. */
const madeOfferIds = (written: Values, previous: Values) => {
  const before = new Set(toEntries(previous[OFFERS_PATH]).map((e) => e.id));
  return new Set(
    toEntries(written[OFFERS_PATH])
      .map((entry) => entry.id)
      .filter((id) => !before.has(id)),
  );
};

const isOfferUnanswered = (entry: Values) =>
  entry.state === 'waiting' &&
  entry.declineCount === 0 &&
  (entry.researchId ?? null) === null;

const stepBack = (step: Step, effect: ExecutionEffect): Step => {
  if (step.isKept) return step;
  const { written, previous } = effect;
  if (!previous) return { ...step, isKept: true };
  const own = Object.keys(written).filter(
    (path) => !isSame(written[path], previous[path]),
  );
  if (own.some((path) => previous[path] === undefined)) {
    return { ...step, isKept: true };
  }
  const toField = (path: string) => path.slice(SEALED_PREFIX.length);
  const live = (path: string) => {
    const value = path.startsWith(SEALED_PREFIX)
      ? readPath(step.opened as unknown as Values | null, toField(path))
      : readPath(step.data, path);
    return isMilestonePath(path) ? (value ?? null) : value;
  };
  const madeIds = madeOfferIds(written, previous);
  const isByEntry = (path: string) =>
    madeIds.size > 0 && (path === OFFERS_PATH || path === ASKS_PATH);
  const isEntryMatch = (path: string) => {
    if (path === OFFERS_PATH) {
      const liveOffers = toEntries(live(path));
      return [...madeIds].every((id) =>
        liveOffers.some((entry) => entry.id === id && isOfferUnanswered(entry)),
      );
    }
    const liveAsks = toKeyed(live(path));
    return [...madeIds].every((id) => liveAsks !== null && id in liveAsks);
  };
  const isMatch = own.every((path) => {
    if (
      path.startsWith(SEALED_PREFIX) ? step.opened === null : step.data === null
    ) {
      return false;
    }
    return isByEntry(path)
      ? isEntryMatch(path)
      : isSame(live(path), written[path]);
  });
  if (!isMatch) {
    // A milestone the person changed since stays; the rest of the turn is still taken back.
    return own.every(isMilestonePath)
      ? { ...step, hasKeptEntry: true }
      : { ...step, isKept: true };
  }
  const withoutMade = (path: string) => {
    if (path === OFFERS_PATH) {
      return toEntries(live(path)).filter((entry) => !madeIds.has(entry.id));
    }
    const rest = Object.fromEntries(
      Object.entries(toKeyed(live(path)) ?? {}).filter(
        ([key]) => !madeIds.has(key),
      ),
    );
    return Object.keys(rest).length === 0 && previous[path] === null
      ? null
      : rest;
  };
  const back: Values = {
    ...previous,
    ...Object.fromEntries(
      own.filter(isByEntry).map((path) => [path, withoutMade(path)]),
    ),
  };
  const sealedPaths = own.filter((path) => path.startsWith(SEALED_PREFIX));
  const dataPaths = own.filter((path) => !path.startsWith(SEALED_PREFIX));
  const identity = (path: string) => path;
  return {
    ...step,
    data: step.data && writePaths(step.data, dataPaths, back, identity),
    opened:
      sealedPaths.length > 0 && step.opened
        ? (writePaths(
            step.opened as unknown as Values,
            sealedPaths,
            back,
            toField,
          ) as unknown as Step['opened'])
        : step.opened,
    fields: {
      ...step.fields,
      ...Object.fromEntries(dataPaths.map((path) => [path, back[path]])),
    },
    sealedFields: {
      ...step.sealedFields,
      ...Object.fromEntries(
        sealedPaths.map((path) => [toField(path), back[path]]),
      ),
    },
    restored: {
      ...step.restored,
      ...Object.fromEntries(own.map((path) => [path, back[path]])),
    },
    current: {
      ...Object.fromEntries(own.map((path) => [path, written[path]])),
      ...step.current,
    },
  };
};

const KEPT_PATHS = [
  'privacy',
  'sealed.privateMark',
  'sealed.isPrivacyCleared',
  'sealed.quietMark',
  'sealed.quietUntil',
  'sealed.isQuietCleared',
];

const isEntity = (name: EffectRef['collection']) =>
  name === 'who' || name === 'places';

const toNumber = (value: unknown) => (typeof value === 'number' ? value : null);

const toKeyKind = (value: unknown): KeyDateSealed['kind'] =>
  ALL_KEY_KINDS.find((entry) => entry === value) ?? 'birthday';

const toPrecision = (value: unknown): KeyDateSealed['precision'] =>
  MOMENT_PRECISIONS.find((entry) => entry === value) ?? null;

/** A removed date comes back under its id from what the removal sealed; it is not brought back for a person who is gone. */
const planRecreate = (
  target: UndoTarget,
  effect: ExecutionEffect,
): RecordOutcome => {
  const previous = effect.previous;
  const title =
    toText(effect.written['sealed.title']) ?? HELM_COPY.resultKeyDateFallback;
  if (!previous || target.data !== null) return { kind: 'skipped' };
  if (target.isOwnerHere === false || typeof previous.whoId !== 'string') {
    return { kind: 'gone' };
  }
  const seal: KeyDateSealed = {
    kind: toKeyKind(previous['sealed.kind']),
    label: toText(previous['sealed.label']),
    month: toNumber(previous['sealed.month']),
    day: toNumber(previous['sealed.day']),
    year: toNumber(previous['sealed.year']),
    precision: toPrecision(previous['sealed.precision']),
    captureId: toText(previous['sealed.captureId']),
  };
  return {
    kind: 'recreated',
    title,
    seal,
    fields: {
      whoId: previous.whoId,
      shape: previous.shape === 'moment' ? 'moment' : 'yearly',
      source: toText(previous.source) ?? 'person',
      createdBy: previous.source === 'nomos' ? 'nomos' : 'person',
      executionId: null,
      createdAt: toNumber(previous.createdAt) ?? 0,
      lastEditedAt: null,
    },
    effect: {
      written: { 'sealed.title': title, ...previous },
      previous: null,
    },
  };
};

const toRelation = (value: unknown): ConnectionSealed['fromFirst'] =>
  typeof value === 'string' ? (value as ConnectionSealed['fromFirst']) : null;

/** A removed connection comes back under its id from what the removal sealed; it is not brought back when either person is gone. */
const planRecreateConnection = (
  target: UndoTarget,
  effect: ExecutionEffect,
): RecordOutcome => {
  const previous = effect.previous;
  const title = toText(effect.written['sealed.title']) ?? '';
  if (!previous || target.data !== null) return { kind: 'skipped' };
  if (target.isOwnerHere === false || !Array.isArray(previous.whoIds)) {
    return { kind: 'gone' };
  }
  return {
    kind: 'recreated',
    title,
    seal: {
      fromFirst: toRelation(previous['sealed.fromFirst']),
      fromSecond: toRelation(previous['sealed.fromSecond']),
      status: (toText(previous['sealed.status']) ??
        null) as ConnectionSealed['status'],
      since: toNumber(previous['sealed.since']),
    },
    fields: {
      whoIds: previous.whoIds,
      kind: previous.kind,
      source: toText(previous.source) ?? 'said',
      createdBy: toText(previous.createdBy) ?? 'nomos',
      executionId: null,
      createdAt: toNumber(previous.createdAt) ?? 0,
      lastEditedAt: null,
    },
    effect: {
      written: { 'sealed.title': title, ...previous },
      previous: null,
    },
  };
};

const isKnowledge = (name: EffectRef['collection'] | undefined) =>
  name === 'notes' || name === 'topics';

const isRunUntouched = (data: Record<string, unknown>) => {
  const steps =
    typeof data.stepState === 'object' && data.stepState !== null
      ? Object.values(data.stepState as Record<string, unknown>)
      : [];
  return (
    (data.finishedAt ?? null) === null &&
    steps.every((step) => {
      const state = step as { doneAt?: unknown; isExtra?: unknown };
      return (state.doneAt ?? null) === null && state.isExtra !== true;
    })
  );
};

/** A saved question goes back to dismissed while nobody has answered it, kept or opened it since; while it is being prepared the rules allow no change, so it stays. */
const planLearnCreate = (
  target: UndoTarget,
  title: string,
  now: number,
): RecordOutcome => {
  const data = target.data ?? {};
  const status = data.status;
  const offers = Array.isArray(data.offers) ? data.offers : [];
  const isUntouched =
    (status === 'planned' || status === 'ready' || status === 'offered') &&
    offers.length === 0 &&
    ((data.notNowStreak as number | undefined) ?? 0) === 0 &&
    (data.resultNoteId ?? null) === null &&
    (data.mergedInto ?? null) === null;
  return isUntouched
    ? {
        kind: 'restored',
        title,
        fields: { status: 'dismissed', lastEditedAt: now },
        reseal: null,
        effect: {
          written: { status: 'dismissed', 'sealed.title': title },
          previous: { status, 'sealed.title': title },
        },
      }
    : { kind: 'kept', title };
};

const planRecord = (
  target: UndoTarget,
  entries: { ref: EffectRef; effect: ExecutionEffect }[],
  now: number,
  madeAt: number,
  isUsedElsewhere: boolean,
  isImport: boolean,
): RecordOutcome => {
  const removal = entries.find((entry) => entry.ref.op === 'delete');
  if (removal)
    return removal.ref.collection === 'connections'
      ? planRecreateConnection(target, removal.effect)
      : planRecreate(target, removal.effect);
  if (target.data === null) return { kind: 'gone' };
  const effects = entries.map((entry) => entry.effect);
  const isSeenAs = entries[0]?.ref.collection === 'seenAs';
  const title = isSeenAs
    ? HELM_COPY.resultSeenAsFallback
    : toTitle(target, effects);
  const left: RecordOutcome = isImport
    ? { kind: 'kept', title }
    : { kind: 'skipped' };
  const newestFirst = [...entries].reverse();
  const create = entries.find((entry) => entry.ref.op === 'create');
  const updated = newestFirst
    .filter((entry) => entry.ref.op === 'update')
    .reduce<Step>((step, entry) => stepBack(step, entry.effect), {
      data: target.data,
      opened: target.opened,
      fields: {},
      sealedFields: {},
      restored: {},
      current: {},
      isKept: false,
      hasKeptEntry: false,
    });
  if (updated.isKept) return { kind: 'kept', title };
  // A person or place a later turn or task also uses stays, quietly: the person never edited it.
  if (create && isEntity(create.ref.collection)) {
    const mentionedAt = target.data.lastMentionedAt;
    const isUsed =
      isUsedElsewhere ||
      (typeof mentionedAt === 'number' && mentionedAt > madeAt) ||
      (target.data.lastEditedAt !== null &&
        target.data.lastEditedAt !== undefined &&
        target.data.lastEditedAt !== madeAt);
    if (isUsed) return left;
  }
  if (create?.ref.collection === 'research') {
    const status = target.data.status;
    if (status === 'dismissed') return left;
    if (target.data.mode === 'learnLater')
      return planLearnCreate(target, title, now);
    return (status === 'asking' || status === 'preparing') &&
      (target.data.lastEditedAt === null || target.data.lastEditedAt === madeAt)
      ? {
          kind: 'restored',
          title,
          fields: { status: 'dismissed', cancelledAt: null, lastEditedAt: now },
          reseal: null,
          effect: {
            written: { status: 'dismissed', 'sealed.title': title },
            previous: { status, 'sealed.title': title },
          },
        }
      : { kind: 'kept', title };
  }
  if (create) {
    if (updated.hasKeptEntry) return { kind: 'kept', title };
    // Its own later effects stamp the record with the execution's time, which is not an edit since.
    const isUntouched =
      create.ref.collection === 'procedureRuns'
        ? isRunUntouched(target.data)
        : target.data.lastEditedAt === null ||
          target.data.lastEditedAt === madeAt;
    return isUntouched
      ? {
          kind: 'deleted',
          title,
          effect: {
            written: { 'sealed.title': title },
            previous: create.effect.written,
          },
        }
      : { kind: 'kept', title };
  }
  if (Object.keys(updated.restored).length === 0) {
    return updated.hasKeptEntry ? { kind: 'kept', title } : left;
  }
  if (
    entries[0]?.ref.collection === 'research' &&
    updated.restored.status === 'planned' &&
    (target.data.prepareAt ?? null) === null
  )
    return { kind: 'kept', title };
  const reseal =
    Object.keys(updated.sealedFields).length > 0
      ? (updated.opened as Exclude<
          UndoTarget['opened'],
          NoteSealed | TopicSealed | ProcedureSealed | RunSealed
        >)
      : null;
  const restoredTitle = isSeenAs
    ? title
    : toOpenedTitle(updated.opened) || title;
  return {
    kind: 'restored',
    title: restoredTitle,
    fields:
      isKnowledge(entries[0]?.ref.collection) || isSeenAs
        ? updated.fields
        : { ...updated.fields, lastEditedAt: now },
    reseal,
    effect: {
      written: { ...updated.restored, 'sealed.title': restoredTitle },
      previous: { ...updated.current, 'sealed.title': title },
    },
  };
};

const isDaySealed = (opened: UndoTarget['opened']): opened is HabitDaySealed =>
  opened !== null &&
  'notes' in opened &&
  !('name' in opened) &&
  typeof opened.notes === 'object';

const isCountPath = (path: string) => /^entries\.[^.]+\.count$/.test(path);
const isCheckPath = (path: string) =>
  /^entries\.[^.]+\.checks\.[^.]+$/.test(path);

/** A check-in on a habit day goes back field by field: each check to what it was (nothing when the turn made it) and each tally to its earlier count, only while the day still holds what the turn wrote there; a note it sealed with the tick is taken out of the day's notes. */
const planHabitDay = (
  target: UndoTarget,
  entries: Entry[],
  original: OpenExecution,
): RecordOutcome => {
  const title = toTitle(
    target,
    entries.map((entry) => entry.effect),
  );
  if (target.data === null) return { kind: 'gone' };
  const stepped = [...entries].reverse().reduce<{
    data: Values;
    restored: Values;
    current: Values;
    isKept: boolean;
  }>(
    (step, { effect }) => {
      const own = Object.keys(effect.written).filter(
        (path) => isCheckPath(path) || isCountPath(path),
      );
      const previous = effect.previous;
      if (step.isKept || !previous) return { ...step, isKept: true };
      const isMatch = own.every(
        (path) =>
          isSame(readPath(step.data, path) ?? null, effect.written[path]) &&
          previous[path] !== undefined,
      );
      return isMatch
        ? {
            data: writePaths(step.data, own, previous, (path) => path),
            restored: {
              ...step.restored,
              ...Object.fromEntries(own.map((path) => [path, previous[path]])),
            },
            current: {
              ...Object.fromEntries(
                own.map((path) => [path, effect.written[path]]),
              ),
              ...step.current,
            },
            isKept: false,
          }
        : { ...step, isKept: true };
    },
    { data: target.data, restored: {}, current: {}, isKept: false },
  );
  if (stepped.isKept) return { kind: 'kept', title };
  const notes = isDaySealed(target.opened) ? target.opened.notes : null;
  const noteKeys = entries.flatMap(({ effect }) => {
    const key = toText(effect.written.noteKey);
    const note = key && notes ? notes[key] : null;
    return key && note && note.captureId === original.captureId ? [key] : [];
  });
  const noteFields = Object.fromEntries(
    [...new Set(noteKeys.map((key) => key.split('/')[0]))].map((habitId) => {
      const live = readPath(target.data, `entries.${habitId}.noteKeys`);
      return [
        `entries.${habitId}.noteKeys`,
        (Array.isArray(live) ? live : []).filter(
          (key) => !noteKeys.includes(key as string),
        ),
      ];
    }),
  );
  const fields = { ...stepped.restored, ...noteFields };
  if (Object.keys(fields).length === 0) return { kind: 'skipped' };
  const reseal: HabitDaySealed | null =
    noteKeys.length > 0 && notes
      ? {
          notes: Object.fromEntries(
            Object.entries(notes).filter(([key]) => !noteKeys.includes(key)),
          ),
        }
      : null;
  return {
    kind: 'restored',
    title,
    fields,
    reseal,
    effect: {
      written: { ...stepped.restored, 'sealed.title': title },
      previous: { ...stepped.current, 'sealed.title': title },
    },
  };
};

const groupByDoc = (original: OpenExecution) =>
  original.effectRefs.reduce<
    Map<string, { ref: EffectRef; effect: ExecutionEffect }[]>
  >(
    (groups, ref, index) =>
      groups.set(ref.docId, [
        ...(groups.get(ref.docId) ?? []),
        { ref, effect: original.effects[index] },
      ]),
    new Map(),
  );

const isClaimLive = (data: Values, now: number) => {
  const claim = data.writeClaim as { at?: unknown } | null | undefined;
  return !!claim && typeof claim.at === 'number' && now - claim.at < CLAIM_MS;
};

type Entry = { ref: EffectRef; effect: ExecutionEffect };

const toTopicName = (target: UndoTarget, fallback: string) =>
  target.opened && 'sections' in target.opened && target.opened.name
    ? target.opened.name
    : fallback;

const toRunName = (target: UndoTarget, fallback: string) =>
  target.opened && 'attachedLabel' in target.opened && target.opened.title
    ? target.opened.title
    : fallback;

const isTickPath = (path: string) => /^stepState\..+\.doneAt$/.test(path);

const toProcedureName = (target: UndoTarget, fallback: string) =>
  target.opened && 'steps' in target.opened && target.opened.title
    ? target.opened.title
    : fallback;

export type ProcedureEffectKind = 'made' | 'version';

/** A procedure effect is the one the turn made (nothing before it) or a new version of one that was there. */
export const procedureEffectKind = (
  effect: ExecutionEffect,
): ProcedureEffectKind =>
  effect.previous === null || !('version' in effect.written)
    ? 'made'
    : 'version';

/** A version a turn wrote goes back only while it is still the newest and nothing is writing the topic. */
const planVersionBack = (
  target: UndoTarget,
  entries: Entry[],
  now: number,
  nameOf: (target: UndoTarget, fallback: string) => string = toTopicName,
): RecordOutcome => {
  const first = entries[0]?.effect;
  const last = entries[entries.length - 1]?.effect;
  const title =
    toText(last?.written['sealed.title']) ?? HELM_COPY.resultTaskFallback;
  const from = toNumber(last?.written.version);
  const to = toNumber(first?.previous?.version);
  const keptTitle = nameOf(target, title);
  if (from === null || to === null) return { kind: 'kept', title: keptTitle };
  if (target.data === null) return { kind: 'gone' };
  if (target.data.version !== from || isClaimLive(target.data, now)) {
    return { kind: 'kept', title: keptTitle };
  }
  return {
    kind: 'versionBack',
    title,
    from,
    to,
    effect: {
      written: { version: from + 1, change: 'restored', 'sealed.title': title },
      previous: { version: from, 'sealed.title': title },
    },
  };
};

/** A move, with the subtree under it, goes back only when every topic in it is still exactly where the turn put it and the old parent is still there. */
const planPlacements = (
  placed: { docId: string; target: UndoTarget; entries: Entry[] }[],
  now: number,
): { docId: string; outcome: RecordOutcome }[] => {
  const lastEffect = ({ entries }: { entries: Entry[] }) =>
    entries[entries.length - 1].effect;
  const isAsLeft = placed.every(({ target, entries }) => {
    const { written } = lastEffect({ entries });
    return (
      target.data !== null &&
      target.data.depth === written.depth &&
      (!('parentId' in written) || target.data.parentId === written.parentId) &&
      target.isOwnerHere !== false
    );
  });
  return placed.map(({ docId, target, entries }) => {
    const { written } = lastEffect({ entries });
    const { previous } = entries[0].effect;
    const title =
      toText(written['sealed.title']) ?? HELM_COPY.resultTaskFallback;
    const isMoved = 'parentId' in written;
    if (!isAsLeft || !previous) {
      return {
        docId,
        outcome: isMoved
          ? { kind: 'kept', title: toTopicName(target, title) }
          : { kind: 'skipped' },
      };
    }
    const restored: Values = {
      depth: previous.depth,
      ...(isMoved ? { parentId: previous.parentId ?? null } : {}),
    };
    const fields: Values = { ...restored, lastEditedAt: now };
    const back = (values: Values, other: Values): ExecutionEffect => ({
      written: { ...values, 'sealed.title': title },
      previous: { ...other, 'sealed.title': title },
    });
    return {
      docId,
      outcome: {
        kind: 'restored',
        title,
        fields,
        reseal: null,
        effect: back(
          restored,
          Object.fromEntries(
            Object.keys(restored).map((key) => [key, written[key]]),
          ),
        ),
      },
    };
  });
};

/** Works out what taking an execution back would write, from the records as they are now. */
export function planUndo(input: {
  original: OpenExecution;
  targets: Map<string, UndoTarget>;
  undoExecutionId: string;
  now: number;
  /** People and places this execution made that another task or turn now links. */
  usedIds: Set<string>;
  /** The question an offered undo answered; written on the undo's own execution. */
  questionRef?: Execution['questionRef'];
  /** Why the undo was asked for; written on the undo's own execution. */
  reason?: UndoReasonRecord;
}): UndoPlan {
  const { original, targets, now, usedIds } = input;
  if (original.undoneByExecutionId !== null) return refuse('alreadyUndone');
  if (
    original.category === 'undo' ||
    original.state !== 'succeeded' ||
    original.effectRefs.length === 0
  ) {
    return refuse('notUndoable');
  }
  if (
    original.isUnreadable ||
    original.effectRefs.length >
      (original.category === 'import'
        ? MAX_IMPORT_EFFECTS
        : MAX_UNDO_EFFECTS) ||
    original.effects.length !== original.effectRefs.length
  ) {
    return refuse('unreadable');
  }

  const collectionOf = toCollectionOf(original);
  const groups = [...groupByDoc(original)];
  const isEntityDoc = (docId: string) =>
    isEntity(collectionOf.get(docId) ?? 'tasks');
  const isTopicDoc = (docId: string) => collectionOf.get(docId) === 'topics';
  const isProcedureDoc = (docId: string) =>
    collectionOf.get(docId) === 'procedures';
  const isRunDoc = (docId: string) =>
    collectionOf.get(docId) === 'procedureRuns';
  const isHabitDayDoc = (docId: string) =>
    collectionOf.get(docId) === 'habitDays';
  const isHabitDoc = (docId: string) => collectionOf.get(docId) === 'habits';
  const isMediaDoc = (docId: string) => collectionOf.get(docId) === 'media';
  const targetOf = (docId: string) =>
    targets.get(docId) ?? { docId, data: null, opened: null };
  const recordOutcomes = groups
    .filter(
      ([docId]) =>
        !isEntityDoc(docId) &&
        !isMediaDoc(docId) &&
        !isHabitDayDoc(docId) &&
        !isTopicDoc(docId) &&
        !isProcedureDoc(docId),
    )
    .map(([docId, entries]) => ({
      docId,
      outcome: planRecord(
        targetOf(docId),
        entries,
        now,
        original.createdAt,
        false,
        false,
      ),
    }));
  // A person or place stays while a record this undo keeps still links it.
  const keptLinks = new Set(
    recordOutcomes.flatMap(({ docId, outcome }) => {
      if (outcome.kind !== 'kept' && outcome.kind !== 'skipped') return [];
      const data = targetOf(docId).data;
      const idsOf = (field: string) =>
        Array.isArray(data?.[field]) ? (data[field] as string[]) : [];
      const ownerId = typeof data?.whoId === 'string' ? [data.whoId] : [];
      return [...idsOf('whoIds'), ...idsOf('placeIds'), ...ownerId];
    }),
  );
  const outcomes = [
    ...recordOutcomes,
    ...groups
      .filter(([docId]) => isEntityDoc(docId))
      .map(([docId, entries]) => ({
        docId,
        outcome: planRecord(
          targetOf(docId),
          entries,
          now,
          original.createdAt,
          usedIds.has(docId) || keptLinks.has(docId),
          original.category === 'import',
        ),
      })),
  ];
  // A topic loses only the notes this undo took back; its state goes back only when nothing else is pending and it is still as the turn left it.
  const takenBackNoteIds = new Set(
    recordOutcomes.flatMap(({ docId, outcome }) =>
      collectionOf.get(docId) === 'notes' &&
      (outcome.kind === 'deleted' || outcome.kind === 'restored')
        ? [docId]
        : [],
    ),
  );
  const toIds = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : [];
  const topicGroups = groups
    .filter(([docId]) => isTopicDoc(docId))
    .map(([docId, entries]) => ({
      docId,
      target: targetOf(docId),
      entries,
      ofKind: (kind: TopicEffectKind) =>
        entries.filter((entry) => topicEffectKind(entry.effect) === kind),
    }));
  const filingOutcomes = topicGroups.map(
    ({ docId, target, ofKind }): { docId: string; outcome: RecordOutcome } => {
      const filing = ofKind('filing');
      const first = filing[0]?.effect;
      const last = filing[filing.length - 1]?.effect;
      const pending = toIds(target.data?.pendingNoteIds);
      const left = pending.filter((id) => !takenBackNoteIds.has(id));
      if (
        !target.data ||
        !first?.previous ||
        !last ||
        left.length === pending.length
      ) {
        return { docId, outcome: { kind: 'skipped' } };
      }
      const isOurs = target.data.docState === last.written.docState;
      const isBack = left.length === 0 && isOurs;
      const title = toTitle(
        target,
        filing.map((entry) => entry.effect),
      );
      const fields: Values = {
        pendingNoteIds: left,
        ...(isBack ? { docState: first.previous.docState } : {}),
      };
      return {
        docId,
        outcome: {
          kind: 'restored',
          title,
          fields,
          reseal: null,
          effect: {
            written: { ...fields, 'sealed.title': title },
            previous: {
              pendingNoteIds: pending,
              ...(isBack ? { docState: target.data.docState } : {}),
              'sealed.title': title,
            },
          },
        },
      };
    },
  );
  const versionOutcomes = topicGroups.flatMap(({ docId, target, ofKind }) => {
    const versions = ofKind('version');
    return versions.length > 0
      ? [{ docId, outcome: planVersionBack(target, versions, now) }]
      : [];
  });
  const placementOutcomes = planPlacements(
    topicGroups.flatMap(({ docId, target, ofKind }) =>
      ofKind('placement').length > 0
        ? [{ docId, target, entries: ofKind('placement') }]
        : [],
    ),
    now,
  );
  const restoredPlacements = new Set(
    placementOutcomes.flatMap(({ docId, outcome }) =>
      outcome.kind === 'restored' ? [docId] : [],
    ),
  );
  // A topic the turn made goes only while nothing but this turn's own moves lives under it; one made from a file starts at the version the import wrote.
  const madeOutcomes = topicGroups.flatMap(
    ({
      docId,
      target,
      ofKind,
    }): { docId: string; outcome: RecordOutcome }[] => {
      const made = ofKind('made')[0];
      if (!made) return [];
      const title =
        toText(made.effect.written['sealed.title']) ??
        HELM_COPY.resultTaskFallback;
      if (target.data === null) return [{ docId, outcome: { kind: 'gone' } }];
      const hasChildren = [...targets.values()].some(
        (other) =>
          other.data?.parentId === docId &&
          !restoredPlacements.has(other.docId),
      );
      const importedVersion = toNumber(made.effect.written.importedVersion);
      const isUntouched =
        target.data.version === (importedVersion ?? 0) &&
        toIds(target.data.pendingNoteIds).length === 0 &&
        !usedIds.has(docId) &&
        !hasChildren;
      const outcome: RecordOutcome = isUntouched
        ? {
            kind: 'deleted',
            title,
            effect: {
              written: { 'sealed.title': title },
              previous: made.effect.written,
            },
          }
        : { kind: 'kept', title };
      return [{ docId, outcome }];
    },
  );
  const topicOutcomes = [
    ...filingOutcomes,
    ...versionOutcomes,
    ...placementOutcomes,
    ...madeOutcomes,
  ];
  // A procedure the turn made goes only while it is still at its first version; a revision goes back like a topic's.
  const procedureOutcomes = groups
    .filter(([docId]) => isProcedureDoc(docId))
    .map(([docId, entries]): { docId: string; outcome: RecordOutcome } => {
      const target = targetOf(docId);
      const made = entries.find(
        (entry) => procedureEffectKind(entry.effect) === 'made',
      );
      if (!made) {
        return {
          docId,
          outcome: planVersionBack(
            target,
            entries.filter(
              (entry) => procedureEffectKind(entry.effect) === 'version',
            ),
            now,
            toProcedureName,
          ),
        };
      }
      const title =
        toText(made.effect.written['sealed.title']) ??
        HELM_COPY.resultTaskFallback;
      const keptTitle = toProcedureName(
        target,
        toText(made.effect.written['sealed.name']) ?? title,
      );
      if (target.data === null) return { docId, outcome: { kind: 'gone' } };
      return {
        docId,
        outcome:
          target.data.version === 1
            ? {
                kind: 'deleted',
                title,
                effect: {
                  written: { 'sealed.title': title },
                  previous: made.effect.written,
                },
              }
            : { kind: 'kept', title: keptTitle },
      };
    });
  // A photo an import added goes with its person: when the person is taken back or restored, or already gone.
  const photoOutcomes = groups
    .filter(([docId]) => isMediaDoc(docId))
    .map(([docId, entries]) => {
      const keep = entries.find(({ ref }) => ref.op === 'update');
      if (keep) {
        const data = targetOf(docId).data;
        const title =
          toText(keep.effect.written['sealed.title']) ??
          HELM_COPY.resultPhotoFallback;
        const isStillKept =
          data?.status === 'kept' &&
          data.role === 'attachment' &&
          data.executionId === original.id;
        const outcome: RecordOutcome =
          data === null
            ? { kind: 'gone' }
            : isStillKept
              ? {
                  kind: 'restored',
                  title,
                  fields: {
                    status: 'discarded',
                    attachedTo: [],
                    decidedAt: now,
                    deleteAfter: now + LET_GO_WINDOW_MS,
                    executionId: null,
                  },
                  reseal: null,
                  effect: {
                    written: { 'sealed.title': title },
                    previous: { attachedTo: data.attachedTo },
                  },
                }
              : { kind: 'skipped' };
        return { docId, outcome };
      }
      const attached = targetOf(docId).data?.attachedTo;
      const ownerIds = Array.isArray(attached)
        ? attached.flatMap((entry: { id?: unknown }) =>
            typeof entry.id === 'string' ? [entry.id] : [],
          )
        : [];
      const isOwnerTakenBack = ownerIds.every((ownerId) => {
        const owner = outcomes.find((entry) => entry.docId === ownerId);
        return (
          !owner ||
          owner.outcome.kind === 'deleted' ||
          owner.outcome.kind === 'restored' ||
          owner.outcome.kind === 'gone'
        );
      });
      const outcome: RecordOutcome =
        targetOf(docId).data === null
          ? { kind: 'gone' }
          : isOwnerTakenBack
            ? {
                kind: 'deleted',
                title: HELM_COPY.resultPhotoFallback,
                effect: {
                  written: { 'sealed.title': HELM_COPY.resultPhotoFallback },
                  previous: { attachedTo: attached },
                },
              }
            : { kind: 'skipped' };
      return { docId, outcome };
    });
  const habitDayOutcomes = groups
    .filter(([docId]) => isHabitDayDoc(docId))
    .map(([docId, entries]) => ({
      docId,
      outcome: planHabitDay(targetOf(docId), entries, original),
    }));
  const everyOutcome = [
    ...outcomes,
    ...topicOutcomes,
    ...procedureOutcomes,
    ...habitDayOutcomes,
  ];
  const kept = everyOutcome.flatMap(({ outcome }) =>
    outcome.kind === 'kept' ? [outcome.title] : [],
  );
  const goneIds = everyOutcome.flatMap(({ docId, outcome }) =>
    outcome.kind === 'gone' ? [docId] : [],
  );
  const gone = goneIds.length;
  const allDone = [
    ...outcomes,
    ...topicOutcomes,
    ...procedureOutcomes,
    ...habitDayOutcomes,
    ...photoOutcomes,
  ].flatMap(({ docId, outcome }) =>
    outcome.kind === 'deleted' ||
    outcome.kind === 'restored' ||
    outcome.kind === 'versionBack' ||
    outcome.kind === 'recreated'
      ? [{ docId, outcome }]
      : [],
  );
  const isKeptOnly = ({ outcome }: (typeof allDone)[number]) =>
    outcome.kind === 'restored' &&
    Object.keys(outcome.effect.written).some((path) =>
      KEPT_PATHS.includes(path),
    ) &&
    Object.keys(outcome.effect.written).every(
      (path) => path === 'sealed.title' || KEPT_PATHS.includes(path),
    );
  const keptDone = allDone.filter(isKeptOnly);
  const done = allDone.filter((entry) => !isKeptOnly(entry));
  const isImport = original.category === 'import';
  const isFactDoc = (docId: string) => collectionOf.get(docId) === 'facts';
  const isKeyDateDoc = (docId: string) =>
    collectionOf.get(docId) === 'keyDates';
  const isProjectDoc = (docId: string) =>
    collectionOf.get(docId) === 'projects';
  const isNoteDoc = (docId: string) => collectionOf.get(docId) === 'notes';
  const isSeenAsDoc = (docId: string) => collectionOf.get(docId) === 'seenAs';
  const projectsDone = done.filter(({ docId }) => isProjectDoc(docId));
  const notesDeleted = done.filter(
    ({ docId, outcome }) => isNoteDoc(docId) && outcome.kind === 'deleted',
  );
  const notesUnfiled = done.filter(
    ({ docId, outcome }) => isNoteDoc(docId) && outcome.kind === 'restored',
  );
  const notesDone = [...notesDeleted, ...notesUnfiled];
  const factsDone = done.filter(({ docId }) => isFactDoc(docId));
  const datesDone = done.filter(({ docId }) => isKeyDateDoc(docId));
  const records = done.filter(({ docId }) =>
    isImport
      ? collectionOf.get(docId) === 'who'
      : !isEntity(collectionOf.get(docId) ?? 'tasks') &&
        !isMediaDoc(docId) &&
        !isFactDoc(docId) &&
        !isKeyDateDoc(docId) &&
        !isProjectDoc(docId) &&
        !isNoteDoc(docId) &&
        !isTopicDoc(docId) &&
        !isProcedureDoc(docId) &&
        !isRunDoc(docId) &&
        !isHabitDoc(docId) &&
        !isHabitDayDoc(docId) &&
        !isSeenAsDoc(docId),
  );
  const seenAsCount = done.filter(({ docId }) => isSeenAsDoc(docId)).length;
  const habitsDone = done.filter(({ docId }) => isHabitDoc(docId));
  const habitDaysDone = done.filter(({ docId }) => isHabitDayDoc(docId));
  const habitCount = habitsDone.length + habitDaysDone.length;
  const photosLetGo = done.filter(
    ({ docId, outcome }) => isMediaDoc(docId) && outcome.kind === 'restored',
  );
  const topicChanges = done.filter(
    ({ docId, outcome }) =>
      isTopicDoc(docId) &&
      (outcome.kind === 'versionBack' ||
        outcome.kind === 'deleted' ||
        (outcome.kind === 'restored' && 'parentId' in outcome.fields)),
  );
  // A grouping writes a version and a move for each child under one line, so changes are counted by their line.
  const topicTitles = [
    ...new Set(topicChanges.map(({ outcome }) => outcome.title)),
  ];
  const topicCount = topicTitles.length;
  const topicNames = [
    ...new Set(
      (topicChanges.some(({ outcome }) => outcome.kind === 'deleted')
        ? topicChanges.filter(({ outcome }) => outcome.kind === 'deleted')
        : topicChanges
      ).flatMap(({ docId }) => {
        const opened = targetOf(docId).opened;
        return opened && 'sections' in opened && opened.name
          ? [opened.name]
          : [];
      }),
    ),
  ];
  const topicName = topicNames.length === 1 ? topicNames[0] : null;
  const isGrouping =
    topicChanges.some(({ outcome }) => outcome.kind === 'deleted') &&
    topicChanges.some(
      ({ outcome }) =>
        outcome.kind === 'restored' && 'parentId' in outcome.fields,
    );
  const procedureChanges = done.filter(
    ({ docId, outcome }) =>
      isProcedureDoc(docId) &&
      (outcome.kind === 'versionBack' || outcome.kind === 'deleted'),
  );
  const procedureCount = new Set(procedureChanges.map(({ docId }) => docId))
    .size;
  const procedureNames = [
    ...new Set(
      procedureChanges.flatMap(({ docId }) => {
        const opened = targetOf(docId).opened;
        return opened && 'steps' in opened && opened.title
          ? [opened.title]
          : [];
      }),
    ),
  ];
  const procedureName = procedureNames.length === 1 ? procedureNames[0] : null;
  const runsDeleted = done.filter(
    ({ docId, outcome }) => isRunDoc(docId) && outcome.kind === 'deleted',
  );
  const runsUnticked = done.filter(
    ({ docId, outcome }) => isRunDoc(docId) && outcome.kind === 'restored',
  );
  const runCount = runsDeleted.length + runsUnticked.length;
  const runTitles = runsDeleted.map(({ docId, outcome }) =>
    toRunName(targetOf(docId), outcome.title),
  );
  const untickedCount = runsUnticked.reduce(
    (total, { outcome }) =>
      total + Object.keys(outcome.effect.written).filter(isTickPath).length,
    0,
  );
  if (
    photosLetGo.length === 0 &&
    notesDone.length === 0 &&
    records.length === 0 &&
    factsDone.length === 0 &&
    datesDone.length === 0 &&
    projectsDone.length === 0 &&
    topicCount === 0 &&
    procedureCount === 0 &&
    runCount === 0 &&
    habitCount === 0 &&
    seenAsCount === 0 &&
    keptDone.length === 0
  ) {
    return refuse(
      'nothingToTakeBack',
      kept,
      HELM_COPY.nothingToTakeBack(kept, gone),
    );
  }

  const counted = records.filter(
    ({ docId }) => collectionOf.get(docId) !== 'profile',
  );
  const homeEffect =
    done.find(({ docId }) => collectionOf.get(docId) === 'profile')?.outcome
      .effect ?? null;
  const isHomeRestored = isStillHome(homeEffect?.written.currentPlace, now);
  const wasLeaving = homeEffect?.previous?.currentPlace === null;
  const factCount = factsDone.length;
  const dateCount = datesDone.length;
  const datesToo =
    dateCount > 0 ? HELM_COPY.undoReportKeyDatesToo(dateCount) : '';
  const projectCount = projectsDone.length;
  const noteCount = notesDeleted.length;
  const unfiledCount = notesUnfiled.length;
  const notesToo = [
    noteCount > 0 ? HELM_COPY.undoReportNotesToo(noteCount) : '',
    unfiledCount > 0 ? HELM_COPY.undoReportNoteUnfiled : '',
  ]
    .filter(Boolean)
    .join(' ');
  const projectsToo = [
    projectCount > 0 ? HELM_COPY.undoReportProjectsToo(projectCount) : '',
    notesToo,
  ]
    .filter(Boolean)
    .join(' ');
  const isNotesOnly =
    records.length === 0 &&
    factCount === 0 &&
    dateCount === 0 &&
    projectCount === 0;
  const baseReport =
    records.length === 0 && factCount === 0 && dateCount === 0
      ? isNotesOnly
        ? [
            noteCount > 0
              ? HELM_COPY.undoReportNotes(noteCount, kept.length, gone)
              : '',
            unfiledCount > 0 ? HELM_COPY.undoReportNoteUnfiled : '',
          ]
            .filter(Boolean)
            .join(' ')
        : [
            HELM_COPY.undoReportProjects(projectCount, kept.length, gone),
            notesToo,
          ]
            .filter(Boolean)
            .join(' ')
      : records.length === 0
        ? factCount === 0
          ? [
              HELM_COPY.undoReportKeyDates(dateCount, kept.length, gone),
              projectsToo,
            ]
              .filter(Boolean)
              .join(' ')
          : [
              HELM_COPY.undoReportFacts(factCount, kept.length, gone),
              datesToo,
              projectsToo,
            ]
              .filter(Boolean)
              .join(' ')
        : [
            counted.length === 0
              ? isHomeRestored
                ? HELM_COPY.undoReportHomeAgain
                : HELM_COPY.undoReportHome
              : isImport
                ? HELM_COPY.undoReportPeople(counted.length, kept.length, gone)
                : HELM_COPY.undoReport(counted.length, kept.length, gone),
            factCount > 0 ? HELM_COPY.undoReportFactsToo(factCount) : '',
            datesToo,
            projectsToo,
          ]
            .filter(Boolean)
            .join(' ');
  const isOnlyKnowledge =
    notesDone.length === 0 &&
    records.length === 0 &&
    factCount === 0 &&
    dateCount === 0 &&
    projectCount === 0;
  const isTopicsOnly = topicCount > 0 && isOnlyKnowledge;
  const isProceduresOnly =
    procedureCount > 0 && topicCount === 0 && isOnlyKnowledge;
  const photoCount = photosLetGo.length;
  const isPhotosOnly =
    photoCount > 0 &&
    notesDone.length === 0 &&
    records.length === 0 &&
    factCount === 0 &&
    dateCount === 0 &&
    projectCount === 0 &&
    topicCount === 0 &&
    procedureCount === 0 &&
    runCount === 0;
  const isRunsOnly =
    runCount > 0 &&
    notesDone.length === 0 &&
    records.length === 0 &&
    factCount === 0 &&
    dateCount === 0 &&
    projectCount === 0 &&
    topicCount === 0 &&
    procedureCount === 0;
  const photosToo = photoCount > 0 ? HELM_COPY.undoReportPhotosToo : '';
  const withTopics = isTopicsOnly
    ? HELM_COPY.undoReportTopics(
        topicCount,
        topicName,
        kept.length,
        gone,
        isGrouping,
      )
    : topicCount > 0
      ? `${baseReport} ${HELM_COPY.undoReportTopicsToo(topicCount, topicName, isGrouping)}`
      : baseReport;
  const withProcedures = isProceduresOnly
    ? HELM_COPY.undoReportProcedures(
        procedureCount,
        procedureName,
        kept.length,
        gone,
      )
    : procedureCount > 0
      ? `${withTopics} ${HELM_COPY.undoReportProceduresToo(procedureCount, procedureName)}`
      : withTopics;
  const withRuns = isRunsOnly
    ? HELM_COPY.undoReportRuns(runTitles, untickedCount, kept.length, gone)
    : runCount > 0
      ? `${withProcedures} ${HELM_COPY.undoReportRunsToo(runTitles, untickedCount)}`
      : withProcedures;
  const keptNames = [...new Set(keptDone.map(({ outcome }) => outcome.title))];
  const keptCount = keptDone.length;
  const keptReport =
    keptCount > 0 ? HELM_COPY.undoReportKept(keptCount, keptNames) : '';
  const isKeptOnlyUndo = keptCount > 0 && done.length === 0;
  const habitsTicked = habitDaysDone.length;
  const habitsChanged = habitsDone.length;
  const isHabitsOnly =
    habitCount > 0 &&
    keptCount === 0 &&
    photoCount === 0 &&
    notesDone.length === 0 &&
    records.length === 0 &&
    factCount === 0 &&
    dateCount === 0 &&
    projectCount === 0 &&
    topicCount === 0 &&
    procedureCount === 0 &&
    runCount === 0;
  const withHabits = isHabitsOnly
    ? HELM_COPY.undoReportHabits(habitsTicked, habitsChanged, kept.length, gone)
    : habitCount > 0
      ? `${withRuns} ${HELM_COPY.undoReportHabitsToo(habitsTicked, habitsChanged)}`
      : withRuns;
  const isSeenAsOnly =
    seenAsCount > 0 &&
    keptCount +
      photoCount +
      records.length +
      factsDone.length +
      datesDone.length +
      notesDone.length +
      projectCount +
      topicCount +
      procedureCount +
      runCount +
      habitCount ===
      0;
  const otherReport = isPhotosOnly
    ? HELM_COPY.undoReportPhotos(photoCount)
    : [withHabits, photosToo, keptReport].filter(Boolean).join(' ');
  const report = isKeptOnlyUndo
    ? keptReport
    : isSeenAsOnly
      ? HELM_COPY.undoReportSeenAs(seenAsCount, kept.length, gone)
      : seenAsCount > 0
        ? `${otherReport} ${HELM_COPY.undoReportSeenAsToo(seenAsCount)}`
        : otherReport;
  const baseSummary =
    records.length === 0
      ? isNotesOnly
        ? noteCount > 0
          ? HELM_COPY.tookBackNotes(noteCount)
          : HELM_COPY.tookBackNoteUnfiled
        : factCount === 0
          ? HELM_COPY.tookBackKeyDates(dateCount)
          : HELM_COPY.tookBackFacts(factCount)
      : counted.length === 0
        ? wasLeaving
          ? HELM_COPY.tookBackNotHome
          : HELM_COPY.tookBackHome
        : isImport
          ? kept.length > 0
            ? HELM_COPY.tookBackPeopleKept(counted.length, kept.length)
            : HELM_COPY.tookBackPeople(counted.length)
          : kept.length > 0
            ? HELM_COPY.tookBackKept(counted.length, kept.length)
            : HELM_COPY.tookBack(counted.length);
  const topicSummary = isTopicsOnly
    ? HELM_COPY.undoTopicChanges(topicCount, topicName, isGrouping)
    : topicCount > 0
      ? `${baseSummary} and ${HELM_COPY.undoTopicPhrase(topicCount, topicName, isGrouping)}`
      : baseSummary;
  const summary = isProceduresOnly
    ? HELM_COPY.undoProcedureChanges(procedureCount, procedureName)
    : procedureCount > 0
      ? `${topicSummary} and ${HELM_COPY.undoProcedurePhrase(procedureCount, procedureName)}`
      : topicSummary;
  const withRunsSummary = isRunsOnly
    ? HELM_COPY.undoRunChanges(runTitles, untickedCount)
    : runCount > 0
      ? `${summary} and ${HELM_COPY.undoRunPhrase(runTitles, untickedCount)}`
      : summary;
  const withHabitsSummary = isHabitsOnly
    ? HELM_COPY.undoHabitChanges(habitsTicked, habitsChanged)
    : habitCount > 0
      ? `${withRunsSummary} and ${HELM_COPY.undoHabitPhrase(habitsTicked, habitsChanged)}`
      : withRunsSummary;
  const deletes = allDone.flatMap(({ docId, outcome }) =>
    outcome.kind === 'deleted'
      ? [{ docId, collection: collectionOf.get(docId) ?? 'tasks' }]
      : [],
  );
  const updates = allDone.flatMap(({ docId, outcome }) =>
    outcome.kind === 'restored'
      ? [
          {
            docId,
            fields: outcome.fields,
            collection: collectionOf.get(docId) ?? 'tasks',
            reseal: outcome.reseal,
          },
        ]
      : [],
  );
  const creates = allDone.flatMap(({ docId, outcome }) =>
    outcome.kind === 'recreated'
      ? [
          {
            docId,
            collection: collectionOf.get(docId) ?? 'keyDates',
            fields: outcome.fields,
            seal: outcome.seal,
          },
        ]
      : [],
  );
  return {
    kind: 'write',
    deletes,
    updates,
    creates,
    versionRestores: allDone.flatMap(({ docId, outcome }) =>
      outcome.kind === 'versionBack'
        ? [
            {
              docId,
              collection:
                collectionOf.get(docId) === 'procedures'
                  ? ('procedures' as const)
                  : ('topics' as const),
              from: outcome.from,
              to: outcome.to,
            },
          ]
        : [],
    ),
    undoExecution: {
      captureId: original.captureId,
      actor: 'person',
      via: null,
      category: 'undo',
      autonomyLevel: 1,
      state: 'succeeded',
      effectRefs: allDone.map(({ docId, outcome }) => ({
        op: outcome.kind === 'deleted' ? 'delete' : 'update',
        collection: collectionOf.get(docId) ?? 'tasks',
        docId,
      })),
      linkedWhoIds: [],
      linkedPlaceIds: [],
      undoesExecutionId: original.id,
      undoneByExecutionId: null,
      undoneDocIds: null,
      partUndoIds: null,
      questionRef: input.questionRef ?? null,
      errorCode: null,
      privacy: 'ordinary',
      createdAt: now,
      decidedAt: now,
      finishedAt: now,
    },
    undoSealed: {
      summary: isKeptOnlyUndo
        ? HELM_COPY.tookBackKeptChange(keptCount, keptNames)
        : isSeenAsOnly
          ? HELM_COPY.tookBackSeenAs(seenAsCount)
          : `${
              isPhotosOnly
                ? HELM_COPY.tookBackPhotos(photoCount)
                : withHabitsSummary
            }${seenAsCount > 0 ? ` and ${HELM_COPY.undoSeenAsPhrase(seenAsCount)}` : ''}`,
      said: null,
      commands: [],
      effects: allDone.map(({ outcome }) => outcome.effect),
      undoReport: report,
      spoken: null,
      heldSpoken: null,
      goneIds,
      undoReason: input.reason ?? null,
      lines: null,
      abilityOffer: null,
      awayZoneOffer: null,
    },
    takenBack: [
      ...records,
      ...factsDone,
      ...datesDone,
      ...notesDone,
      ...topicChanges,
      ...procedureChanges,
      ...runsDeleted,
      ...runsUnticked,
      ...habitsDone,
      ...habitDaysDone,
      ...done.filter(({ docId }) => isSeenAsDoc(docId)),
    ].map(({ outcome }) => outcome.title),
    kept,
    gone,
    goneIds,
    report,
  };
}

export type Narrowing =
  | {
      kind: 'ok';
      view: OpenExecution;
      /** Whether this undo takes back the last of what the execution wrote. */
      isFinal: boolean;
      /** The records the original gains as undone. */
      recordedDocIds: string[];
    }
  | { kind: 'refused'; reason: 'alreadyUndone' };

const toOwnerIds = (effect: ExecutionEffect | undefined) => {
  const attached = effect?.written.attachedTo;
  return Array.isArray(attached)
    ? attached.flatMap((entry: { id?: unknown }) =>
        typeof entry?.id === 'string' ? [entry.id] : [],
      )
    : [];
};

/** Narrows an execution to the units a partial undo takes back (`null` takes every one still left), keeping each effect with its ref. */
export function narrowForUndo(
  original: OpenExecution,
  docIds: string[] | null,
): Narrowing {
  if (original.undoneByExecutionId !== null) {
    return { kind: 'refused', reason: 'alreadyUndone' };
  }
  const built = buildUndoUnits(original);
  const undone = getUndoneDocIds(original);
  const remaining = getRemainingUnits(built.units, undone);
  const refs = original.effectRefs;
  const keep = (indexes: number[]): OpenExecution => ({
    ...original,
    effectRefs: indexes.map((index) => refs[index]),
    effects: indexes.map((index) => original.effects[index]),
  });
  const everyDocId = [...new Set(refs.map((ref) => ref.docId))];
  if (built.units.length === 0) {
    return {
      kind: 'ok',
      view: original,
      isFinal: true,
      recordedDocIds: everyDocId,
    };
  }
  const wanted = docIds === null ? null : new Set(docIds);
  const selected = remaining.filter(
    (unit) => !wanted || unit.docIds.some((id) => wanted.has(id)),
  );
  if (selected.length === 0)
    return { kind: 'refused', reason: 'alreadyUndone' };
  const isFinal = selected.length === remaining.length;
  const selectedDocIds = new Set(selected.flatMap((unit) => unit.docIds));
  const executionDocIds = new Set(built.units.flatMap((unit) => unit.docIds));
  const isMediaEligible = (index: number) => {
    if (undone.has(refs[index].docId)) return false;
    if (isFinal) return true;
    const owners = toOwnerIds(original.effects[index]).filter((id) =>
      executionDocIds.has(id),
    );
    return (
      owners.length > 0 &&
      owners.every((id) => selectedDocIds.has(id) || undone.has(id))
    );
  };
  const indexes = [
    ...selected.flatMap((unit) => unit.effectIndexes),
    ...built.riders,
    ...built.media.filter(isMediaEligible),
    ...(isFinal
      ? [
          ...built.entities.filter((index) => !undone.has(refs[index].docId)),
          ...built.rest.filter((index) => !undone.has(refs[index].docId)),
        ]
      : []),
  ].sort((a, b) => a - b);
  return {
    kind: 'ok',
    view: keep([...new Set(indexes)]),
    isFinal,
    recordedDocIds: isFinal
      ? everyDocId
      : [
          ...selectedDocIds,
          ...built.media
            .filter(isMediaEligible)
            .map((index) => refs[index].docId),
        ],
  };
}

/** The records an undo offer's choice would still take back from an execution: every unit left when it is the whole turn, else the ones it names that are not yet undone; empty once nothing is left. */
export function toOfferDocIds(
  choice: Pick<UndoChoice, 'docIds' | 'isAll'>,
  execution: OpenExecution,
): string[] {
  if (execution.undoneByExecutionId !== null) return [];
  const built = buildUndoUnits(execution);
  if (built.units.length === 0) {
    return [...new Set(execution.effectRefs.map((ref) => ref.docId))];
  }
  const remaining = getRemainingUnits(
    built.units,
    getUndoneDocIds(execution),
  ).flatMap((unit) => unit.docIds);
  const wanted = new Set(choice.docIds);
  return [
    ...new Set(
      choice.isAll ? remaining : remaining.filter((id) => wanted.has(id)),
    ),
  ];
}

/** The records an Undo took back (restored or deleted), by id. */
export const getTakenBackIds = (undo: OpenExecution | null) =>
  new Set(
    undo
      ? undo.effectRefs.flatMap((ref) =>
          ref.op === 'create' ? [] : [ref.docId],
        )
      : [],
  );

const REOPENABLE_KINDS = [
  'whichIsTrue',
  'groupTopics',
  'whichComesFirst',
  'isThisWho',
  'whichKin',
  'kinOrder',
  'questionsTask',
];

/** What taking back an answer to a "which is true now?", "group these?", "is this who?", family or "make these questions a task?" question writes to its turn so the question asks again; null for any other execution. */
export const planReopen = (
  original: Pick<OpenExecution, 'questionRef'>,
  capture: {
    status: string;
    questionState: Record<string, { kind: string; answeredAt: number | null }>;
  } | null,
): Record<string, unknown> | null => {
  const ref = original.questionRef;
  const state = ref && capture ? capture.questionState[ref.questionId] : null;
  if (!ref || !capture || !state) return null;
  if (!REOPENABLE_KINDS.includes(state.kind) || state.answeredAt === null) {
    return null;
  }
  return {
    [`questionState.${ref.questionId}.answeredAt`]: null,
    ...(capture.status === 'sorted' && { status: 'needsYou' }),
  };
};
