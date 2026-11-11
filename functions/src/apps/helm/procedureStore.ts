import { logger } from 'firebase-functions/v2';
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../appKeys/seal.js';
import { openForHelm, type HelmKey } from './helmKey.js';
import { versionsToDelete } from './topicWrite.js';
import type { PlannedProcedureVersion } from './nomos/planProcedureCommands.js';
import type { StepGroupBlock } from './stepGroups.js';
import { groupSteps } from './stepGroups.js';

const MAX_DELETES = 400;

export const PROCEDURES_LIMIT = 200;
export const PROCEDURE_VERSIONS_KEPT = 200;
const CONTEXT_PROCEDURES = 50;

export interface ProcedureStepState {
  order: number;
  groupId: string | null;
}

export interface ProcedureWords {
  title: string;
  steps: Record<string, { text: string; detail: string | null }>;
  groups: Record<string, { name: string }>;
}

/** A procedure as a turn read it, its words opened. */
export interface LiveProcedure extends ProcedureWords {
  id: string;
  version: number;
  stepState: Record<string, ProcedureStepState>;
  groupOrder: string[];
  sourceTaskId: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStepState = (value: unknown): Record<string, ProcedureStepState> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, place]) =>
          isRecord(place) && typeof place.order === 'number'
            ? [
                [
                  id,
                  {
                    order: place.order,
                    groupId:
                      typeof place.groupId === 'string' ? place.groupId : null,
                  },
                ] as [string, ProcedureStepState],
              ]
            : [],
        ),
      )
    : {};

const toSteps = (value: unknown): ProcedureWords['steps'] =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, step]) =>
          isRecord(step) && typeof step.text === 'string'
            ? [
                [
                  id,
                  {
                    text: step.text,
                    detail:
                      typeof step.detail === 'string' ? step.detail : null,
                  },
                ] as [string, { text: string; detail: string | null }],
              ]
            : [],
        ),
      )
    : {};

const toGroups = (value: unknown): ProcedureWords['groups'] =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, group]) =>
          isRecord(group) && typeof group.name === 'string'
            ? [[id, { name: group.name }] as [string, { name: string }]]
            : [],
        ),
      )
    : {};

/** Opens a procedure document; null when its words will not open. */
export const openLiveProcedure = (
  key: HelmKey,
  id: string,
  data: Record<string, unknown>,
): LiveProcedure | null => {
  try {
    const words = openForHelm(key, data.sealed as SealedPayload);
    return typeof words.title === 'string' && words.title !== ''
      ? {
          id,
          title: words.title,
          version: typeof data.version === 'number' ? data.version : 0,
          stepState: toStepState(data.stepState),
          groupOrder: Array.isArray(data.groupOrder)
            ? data.groupOrder.filter(
                (entry): entry is string => typeof entry === 'string',
              )
            : [],
          steps: toSteps(words.steps),
          groups: toGroups(words.groups),
          sourceTaskId:
            typeof data.sourceTaskId === 'string' ? data.sourceTaskId : null,
        }
      : null;
  } catch {
    return null;
  }
};

/** A procedure's steps in their named groups, ungrouped first. */
export const blocksOf = (procedure: LiveProcedure): StepGroupBlock[] =>
  groupSteps(procedure);

/** The numbers of the versions a procedure keeps, read before any write of the transaction. */
export const readProcedureVersionNumbers = async (
  transaction: Transaction,
  procedureRef: DocumentReference,
) =>
  (
    await transaction.get(procedureRef.collection('versions').select())
  ).docs.map((doc) => Number(doc.id));

/** The one place a server procedure version is written: the procedure's new document, its version record and the oldest versions past the cap, all in the caller's transaction. */
export const writeProcedureVersionIn = (
  transaction: Transaction,
  input: {
    procedureRef: DocumentReference;
    planned: PlannedProcedureVersion;
    existingVersions: number[];
    now: number;
    seal: (fields: Record<string, unknown>) => SealedPayload;
  },
): number => {
  const { procedureRef, planned, now, seal } = input;
  const version = planned.currentVersion + 1;
  const words = {
    title: planned.title,
    steps: planned.steps,
    groups: planned.groups,
  };
  transaction.update(procedureRef, {
    stepState: planned.stepState,
    groupOrder: planned.groupOrder,
    version,
    lastEditedAt: now,
    sealed: seal(words),
  });
  transaction.set(procedureRef.collection('versions').doc(String(version)), {
    version,
    restoredFromVersion: null,
    createdBy: 'nomos',
    reason: 'revisedOnRequest',
    stepState: planned.stepState,
    groupOrder: planned.groupOrder,
    sourceCaptureId: planned.sourceCaptureId,
    executionId: planned.executionId,
    createdAt: now,
    sealed: seal({
      ...words,
      changeSummary: planned.changeSummary,
      requestQuote: planned.requestQuote,
    }),
  });
  versionsToDelete(
    [...input.existingVersions, version],
    PROCEDURE_VERSIONS_KEPT,
  )
    .slice(0, MAX_DELETES)
    .forEach((old) =>
      transaction.delete(procedureRef.collection('versions').doc(String(old))),
    );
  return version;
};

export interface ContextProcedureRecord extends LiveProcedure {
  lastAt: number;
}

/** The person's newest procedures, opened, for the model to know which exist. A failed read is logged and leaves the turn without them. */
export async function readContextProcedures(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  max: number = CONTEXT_PROCEDURES,
): Promise<ContextProcedureRecord[]> {
  try {
    const docs = (
      await firestore
        .collection(`${base}/procedures`)
        .orderBy('createdAt', 'desc')
        .limit(PROCEDURES_LIMIT)
        .get()
    ).docs;
    return docs
      .flatMap((doc): ContextProcedureRecord[] => {
        const data = doc.data();
        const procedure = openLiveProcedure(key, doc.id, data);
        return procedure
          ? [
              {
                ...procedure,
                lastAt: Number(data.lastEditedAt ?? data.createdAt ?? 0),
              },
            ]
          : [];
      })
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, max);
  } catch (error) {
    logger.warn('helm.sort.proceduresUnreadable', {
      cause: error instanceof Error ? error.name : 'error',
    });
    return [];
  }
}

/** One procedure by id, opened; null when it is missing or will not open. */
export async function readFocusedProcedure(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  procedureId: string | null,
): Promise<LiveProcedure | null> {
  if (!procedureId) return null;
  try {
    const data = (
      await firestore.doc(`${base}/procedures/${procedureId}`).get()
    ).data();
    return data ? openLiveProcedure(key, procedureId, data) : null;
  } catch {
    return null;
  }
}

/** A task's title and its steps' words in the person's order, for making them a procedure. */
export const openTaskSteps = (
  key: HelmKey,
  data: Record<string, unknown>,
): { title: string; steps: string[] } | null => {
  try {
    const words = openForHelm(key, data.sealed as SealedPayload);
    const steps = toSteps(words.steps);
    const state = toStepState(data.stepState);
    return typeof words.title === 'string' && words.title !== ''
      ? {
          title: words.title,
          steps: Object.entries(state)
            .filter(([id]) => id in steps)
            .sort(([a, x], [b, y]) => x.order - y.order || a.localeCompare(b))
            .map(([id]) => steps[id].text),
        }
      : null;
  } catch {
    return null;
  }
};
