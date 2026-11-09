import { HELM_COPY } from '@apps/helm/constants';
import type {
  EffectRef,
  Execution,
  ExecutionEffect,
  ExecutionSealed,
  OpenExecution,
  TaskSealed,
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
  opened: TaskSealed | null;
}

export type UndoRefusal =
  'alreadyUndone' | 'notUndoable' | 'nothingToTakeBack' | 'unreadable';

export type UndoPlan =
  | {
      kind: 'write';
      deletes: string[];
      updates: {
        docId: string;
        fields: Record<string, unknown>;
        reseal: TaskSealed | null;
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

/** An undo reads every record in one transaction, and no execution makes more effects than this. */
const MAX_EFFECTS = 40;

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
  opened: TaskSealed | null;
  fields: Values;
  sealedFields: Values;
  restored: Values;
  current: Values;
  isKept: boolean;
}

type RecordOutcome =
  | { kind: 'gone' }
  | { kind: 'kept'; title: string }
  | { kind: 'skipped' }
  | { kind: 'deleted'; title: string; effect: ExecutionEffect }
  | {
      kind: 'restored';
      title: string;
      fields: Values;
      reseal: TaskSealed | null;
      effect: ExecutionEffect;
    };

const toTitle = (target: UndoTarget, effects: ExecutionEffect[]) =>
  target.opened?.title ||
  effects
    .map((effect) => effect.written['sealed.title'])
    .find((title): title is string => typeof title === 'string' && !!title) ||
  HELM_COPY.resultTaskFallback;

/** Applies one update effect to the working copy; a path it didn't change (written equals previous) is a label and is neither compared nor restored. */
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
  const isMatch = own.every((path) =>
    path.startsWith(SEALED_PREFIX)
      ? step.opened !== null &&
        isSame(
          (step.opened as unknown as Values)[path.slice(SEALED_PREFIX.length)],
          written[path],
        )
      : step.data !== null && isSame(step.data[path], written[path]),
  );
  if (!isMatch) return { ...step, isKept: true };
  const sealedPaths = own.filter((path) => path.startsWith(SEALED_PREFIX));
  const dataPaths = own.filter((path) => !path.startsWith(SEALED_PREFIX));
  const toField = (path: string) => path.slice(SEALED_PREFIX.length);
  return {
    ...step,
    data: step.data && {
      ...step.data,
      ...Object.fromEntries(dataPaths.map((path) => [path, previous[path]])),
    },
    opened:
      sealedPaths.length > 0 && step.opened
        ? {
            ...step.opened,
            ...Object.fromEntries(
              sealedPaths.map((path) => [toField(path), previous[path]]),
            ),
          }
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

const planRecord = (
  target: UndoTarget,
  entries: { ref: EffectRef; effect: ExecutionEffect }[],
  now: number,
  madeAt: number,
): RecordOutcome => {
  if (target.data === null) return { kind: 'gone' };
  const effects = entries.map((entry) => entry.effect);
  const title = toTitle(target, effects);
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
    });
  if (updated.isKept) return { kind: 'kept', title };
  if (create) {
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
  if (Object.keys(updated.restored).length === 0) return { kind: 'skipped' };
  const reseal =
    Object.keys(updated.sealedFields).length > 0 ? updated.opened : null;
  const restoredTitle = updated.opened?.title || title;
  return {
    kind: 'restored',
    title: restoredTitle,
    fields: { ...updated.fields, lastEditedAt: now },
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

/** Works out what taking an execution back would write, from the records as they are now. */
export function planUndo(input: {
  original: OpenExecution;
  targets: Map<string, UndoTarget>;
  undoExecutionId: string;
  now: number;
}): UndoPlan {
  const { original, targets, now } = input;
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
    original.effectRefs.length > MAX_EFFECTS ||
    original.effects.length !== original.effectRefs.length ||
    original.effectRefs.some((ref) => ref.collection !== 'tasks')
  ) {
    return refuse('unreadable');
  }

  const outcomes = [...groupByDoc(original)].map(([docId, entries]) => ({
    docId,
    outcome: planRecord(
      targets.get(docId) ?? { docId, data: null, opened: null },
      entries,
      now,
      original.createdAt,
    ),
  }));
  const kept = outcomes.flatMap(({ outcome }) =>
    outcome.kind === 'kept' ? [outcome.title] : [],
  );
  const goneIds = outcomes.flatMap(({ docId, outcome }) =>
    outcome.kind === 'gone' ? [docId] : [],
  );
  const gone = goneIds.length;
  const done = outcomes.flatMap(({ docId, outcome }) =>
    outcome.kind === 'deleted' || outcome.kind === 'restored'
      ? [{ docId, outcome }]
      : [],
  );
  if (done.length === 0) {
    return refuse(
      'nothingToTakeBack',
      kept,
      HELM_COPY.nothingToTakeBack(kept, gone),
    );
  }

  const report = HELM_COPY.undoReport(done.length, kept.length, gone);
  const deletes = done.flatMap(({ docId, outcome }) =>
    outcome.kind === 'deleted' ? [docId] : [],
  );
  const updates = done.flatMap(({ docId, outcome }) =>
    outcome.kind === 'restored'
      ? [{ docId, fields: outcome.fields, reseal: outcome.reseal }]
      : [],
  );
  return {
    kind: 'write',
    deletes,
    updates,
    undoExecution: {
      captureId: original.captureId,
      actor: 'person',
      category: 'undo',
      autonomyLevel: 1,
      state: 'succeeded',
      effectRefs: done.map(({ docId, outcome }) => ({
        op: outcome.kind === 'deleted' ? 'delete' : 'update',
        collection: 'tasks',
        docId,
      })),
      undoesExecutionId: original.id,
      undoneByExecutionId: null,
      questionRef: null,
      errorCode: null,
      createdAt: now,
      decidedAt: now,
      finishedAt: now,
    },
    undoSealed: {
      summary:
        kept.length > 0
          ? HELM_COPY.tookBackKept(done.length, kept.length)
          : HELM_COPY.tookBack(done.length),
      commands: [],
      effects: done.map(({ outcome }) => outcome.effect),
      undoReport: report,
      spoken: null,
      goneIds,
    },
    takenBack: done.map(({ outcome }) => outcome.title),
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
