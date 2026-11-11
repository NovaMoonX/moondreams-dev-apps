import { CLAIM_MS, HELM_COPY } from '@apps/helm/constants';
import { CURRENT_PLACE_MS } from '@apps/helm/engine/currentPlace';
import { ALL_KEY_KINDS, MOMENT_PRECISIONS } from '@apps/helm/utils/moments';
import type {
  EffectRef,
  Execution,
  ExecutionEffect,
  ExecutionSealed,
  KeyDateSealed,
  NoteSealed,
  OpenExecution,
  ProjectSealed,
  TaskSealed,
  TopicSealed,
  WhoSealed,
} from '@apps/helm/types';

/** Whether an Undo is offered: a readable, succeeded execution that is not itself an Undo, not yet undone, and changed something. */
export const canUndo = (execution: OpenExecution) =>
  !execution.isUnreadable &&
  execution.state === 'succeeded' &&
  execution.category !== 'undo' &&
  execution.undoneByExecutionId === null &&
  execution.effectRefs.length > 0;

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
    | NoteSealed
    | TopicSealed
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
        reseal: TaskSealed | WhoSealed | KeyDateSealed | ProjectSealed | null;
      }[];
      /** Topics whose document goes back to an earlier version, written as a new version `from + 1` holding the parts of `to`. */
      versionRestores: { docId: string; from: number; to: number }[];
      /** Dates the assistant removed, written back under the same ids. */
      creates: {
        docId: string;
        collection: EffectRef['collection'];
        fields: Values;
        seal: KeyDateSealed;
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

/** An undo reads every record in one transaction, and no execution makes more effects than this; an import of 50 people with their photos is the largest. */
const MAX_EFFECTS = 40;
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
      reseal: TaskSealed | WhoSealed | KeyDateSealed | ProjectSealed | null;
      effect: ExecutionEffect;
    }
  | {
      kind: 'recreated';
      title: string;
      fields: Values;
      seal: KeyDateSealed;
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
  const isMatch = own.every((path) =>
    path.startsWith(SEALED_PREFIX)
      ? step.opened !== null && isSame(live(path), written[path])
      : step.data !== null && isSame(live(path), written[path]),
  );
  if (!isMatch) {
    // A milestone the person changed since stays; the rest of the turn is still taken back.
    return own.every(isMilestonePath)
      ? { ...step, hasKeptEntry: true }
      : { ...step, isKept: true };
  }
  const sealedPaths = own.filter((path) => path.startsWith(SEALED_PREFIX));
  const dataPaths = own.filter((path) => !path.startsWith(SEALED_PREFIX));
  const identity = (path: string) => path;
  return {
    ...step,
    data: step.data && writePaths(step.data, dataPaths, previous, identity),
    opened:
      sealedPaths.length > 0 && step.opened
        ? (writePaths(
            step.opened as unknown as Values,
            sealedPaths,
            previous,
            toField,
          ) as unknown as Step['opened'])
        : step.opened,
    fields: {
      ...step.fields,
      ...Object.fromEntries(dataPaths.map((path) => [path, previous[path]])),
    },
    sealedFields: {
      ...step.sealedFields,
      ...Object.fromEntries(
        sealedPaths.map((path) => [toField(path), previous[path]]),
      ),
    },
    restored: {
      ...step.restored,
      ...Object.fromEntries(own.map((path) => [path, previous[path]])),
    },
    current: {
      ...Object.fromEntries(own.map((path) => [path, written[path]])),
      ...step.current,
    },
  };
};

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

const isKnowledge = (name: EffectRef['collection'] | undefined) =>
  name === 'notes' || name === 'topics';

const planRecord = (
  target: UndoTarget,
  entries: { ref: EffectRef; effect: ExecutionEffect }[],
  now: number,
  madeAt: number,
  isUsedElsewhere: boolean,
  isImport: boolean,
): RecordOutcome => {
  const removal = entries.find((entry) => entry.ref.op === 'delete');
  if (removal) return planRecreate(target, removal.effect);
  if (target.data === null) return { kind: 'gone' };
  const effects = entries.map((entry) => entry.effect);
  const title = toTitle(target, effects);
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
  if (create) {
    if (updated.hasKeptEntry) return { kind: 'kept', title };
    // Its own later effects stamp the record with the execution's time, which is not an edit since.
    const isUntouched =
      target.data.lastEditedAt === null || target.data.lastEditedAt === madeAt;
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
  const reseal =
    Object.keys(updated.sealedFields).length > 0
      ? (updated.opened as Exclude<
          UndoTarget['opened'],
          NoteSealed | TopicSealed
        >)
      : null;
  const restoredTitle = toOpenedTitle(updated.opened) || title;
  return {
    kind: 'restored',
    title: restoredTitle,
    fields: isKnowledge(entries[0]?.ref.collection)
      ? updated.fields
      : { ...updated.fields, lastEditedAt: now },
    reseal,
    effect: {
      written: { ...updated.restored, 'sealed.title': restoredTitle },
      previous: { ...updated.current, 'sealed.title': title },
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

export type TopicEffectKind = 'filing' | 'version' | 'placement' | 'made';

/** Which of the four shapes a topic effect has: a filing (`docState`, `pendingNoteIds`), a new version, a move (`parentId`, `depth`) or a topic the turn made (nothing before it). */
export const topicEffectKind = (effect: ExecutionEffect): TopicEffectKind =>
  'docState' in effect.written || 'pendingNoteIds' in effect.written
    ? 'filing'
    : 'version' in effect.written
      ? 'version'
      : effect.previous === null
        ? 'made'
        : 'depth' in effect.written || 'parentId' in effect.written
          ? 'placement'
          : 'filing';

const isClaimLive = (data: Values, now: number) => {
  const claim = data.writeClaim as { at?: unknown } | null | undefined;
  return !!claim && typeof claim.at === 'number' && now - claim.at < CLAIM_MS;
};

type Entry = { ref: EffectRef; effect: ExecutionEffect };

/** A version a turn wrote goes back only while it is still the newest and nothing is writing the topic. */
const planVersionBack = (
  target: UndoTarget,
  entries: Entry[],
  now: number,
): RecordOutcome => {
  const first = entries[0]?.effect;
  const last = entries[entries.length - 1]?.effect;
  const title =
    toText(last?.written['sealed.title']) ?? HELM_COPY.resultTaskFallback;
  const from = toNumber(last?.written.version);
  const to = toNumber(first?.previous?.version);
  if (from === null || to === null) return { kind: 'kept', title };
  if (target.data === null) return { kind: 'gone' };
  if (target.data.version !== from || isClaimLive(target.data, now)) {
    return { kind: 'kept', title };
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
  const readEffect = ({ entries }: { entries: Entry[] }) =>
    entries[entries.length - 1].effect;
  const isAsLeft = placed.every(({ target, entries }) => {
    const { written } = readEffect({ entries });
    return (
      target.data !== null &&
      target.data.depth === written.depth &&
      (!('parentId' in written) || target.data.parentId === written.parentId) &&
      target.isOwnerHere !== false
    );
  });
  return placed.map(({ docId, entries }) => {
    const { written, previous } = readEffect({ entries });
    const title =
      toText(written['sealed.title']) ?? HELM_COPY.resultTaskFallback;
    const isMoved = 'parentId' in written;
    if (!isAsLeft || !previous) {
      return {
        docId,
        outcome: isMoved ? { kind: 'kept', title } : { kind: 'skipped' },
      };
    }
    const restored: Values = {
      depth: previous.depth,
      ...(isMoved ? { parentId: previous.parentId } : {}),
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
      (original.category === 'import' ? MAX_IMPORT_EFFECTS : MAX_EFFECTS) ||
    original.effects.length !== original.effectRefs.length
  ) {
    return refuse('unreadable');
  }

  const collectionOf = toCollectionOf(original);
  const groups = [...groupByDoc(original)];
  const isEntityDoc = (docId: string) =>
    isEntity(collectionOf.get(docId) ?? 'tasks');
  const isTopicDoc = (docId: string) => collectionOf.get(docId) === 'topics';
  const isMediaDoc = (docId: string) => collectionOf.get(docId) === 'media';
  const targetOf = (docId: string) =>
    targets.get(docId) ?? { docId, data: null, opened: null };
  const recordOutcomes = groups
    .filter(
      ([docId]) =>
        !isEntityDoc(docId) && !isMediaDoc(docId) && !isTopicDoc(docId),
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
  // A topic the turn made goes only while nothing but this turn's own moves lives under it.
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
      const isUntouched =
        target.data.version === 0 &&
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
  // A photo an import added goes with its person: when the person is taken back or restored, or already gone.
  const photoOutcomes = groups
    .filter(([docId]) => isMediaDoc(docId))
    .map(([docId]) => {
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
  const kept = [...outcomes, ...topicOutcomes].flatMap(({ outcome }) =>
    outcome.kind === 'kept' ? [outcome.title] : [],
  );
  const goneIds = [...outcomes, ...topicOutcomes].flatMap(
    ({ docId, outcome }) => (outcome.kind === 'gone' ? [docId] : []),
  );
  const gone = goneIds.length;
  const done = [...outcomes, ...topicOutcomes, ...photoOutcomes].flatMap(
    ({ docId, outcome }) =>
      outcome.kind === 'deleted' ||
      outcome.kind === 'restored' ||
      outcome.kind === 'versionBack' ||
      outcome.kind === 'recreated'
        ? [{ docId, outcome }]
        : [],
  );
  const isImport = original.category === 'import';
  const isFactDoc = (docId: string) => collectionOf.get(docId) === 'facts';
  const isKeyDateDoc = (docId: string) =>
    collectionOf.get(docId) === 'keyDates';
  const isProjectDoc = (docId: string) =>
    collectionOf.get(docId) === 'projects';
  const isNoteDoc = (docId: string) => collectionOf.get(docId) === 'notes';
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
        !isTopicDoc(docId),
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
  if (
    notesDone.length === 0 &&
    records.length === 0 &&
    factsDone.length === 0 &&
    datesDone.length === 0 &&
    projectsDone.length === 0 &&
    topicCount === 0
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
  const isTopicsOnly =
    topicCount > 0 &&
    notesDone.length === 0 &&
    records.length === 0 &&
    factCount === 0 &&
    dateCount === 0 &&
    projectCount === 0;
  const report = isTopicsOnly
    ? HELM_COPY.undoReportTopics(topicCount, topicName, kept.length, gone)
    : topicCount > 0
      ? `${baseReport} ${HELM_COPY.undoReportTopicsToo(topicCount, topicName)}`
      : baseReport;
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
  const deletes = done.flatMap(({ docId, outcome }) =>
    outcome.kind === 'deleted'
      ? [{ docId, collection: collectionOf.get(docId) ?? 'tasks' }]
      : [],
  );
  const updates = done.flatMap(({ docId, outcome }) =>
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
  const creates = done.flatMap(({ docId, outcome }) =>
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
    versionRestores: done.flatMap(({ docId, outcome }) =>
      outcome.kind === 'versionBack'
        ? [{ docId, from: outcome.from, to: outcome.to }]
        : [],
    ),
    undoExecution: {
      captureId: original.captureId,
      actor: 'person',
      category: 'undo',
      autonomyLevel: 1,
      state: 'succeeded',
      effectRefs: done.map(({ docId, outcome }) => ({
        op: outcome.kind === 'deleted' ? 'delete' : 'update',
        collection: collectionOf.get(docId) ?? 'tasks',
        docId,
      })),
      linkedWhoIds: [],
      linkedPlaceIds: [],
      undoesExecutionId: original.id,
      undoneByExecutionId: null,
      questionRef: null,
      errorCode: null,
      createdAt: now,
      decidedAt: now,
      finishedAt: now,
    },
    undoSealed: {
      summary: isTopicsOnly
        ? HELM_COPY.undoTopicChanges(topicCount, topicName)
        : topicCount > 0
          ? `${baseSummary} and ${HELM_COPY.undoTopicPhrase(topicCount, topicName)}`
          : baseSummary,
      commands: [],
      effects: done.map(({ outcome }) => outcome.effect),
      undoReport: report,
      spoken: null,
      goneIds,
      lines: null,
    },
    takenBack: [
      ...records,
      ...factsDone,
      ...datesDone,
      ...notesDone,
      ...topicChanges,
    ].map(({ outcome }) => outcome.title),
    kept,
    gone,
    goneIds,
    report,
  };
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

/** What taking back an answer to a "which is true now?" question writes to its turn so the question asks again; null for any other execution. */
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
  if (state.kind !== 'whichIsTrue' || state.answeredAt === null) return null;
  return {
    [`questionState.${ref.questionId}.answeredAt`]: null,
    ...(capture.status === 'sorted' && { status: 'needsYou' }),
  };
};
