import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentSnapshot,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { RUNS_OPEN_LIMIT } from '@apps/helm/constants';
import type {
  OpenRun,
  ProcedureRun,
  RunAttachment,
  RunSealed,
  RunStepPlace,
} from '@apps/helm/types';
import type { StepBody } from '@apps/helm/utils/stepGroups';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your runs did not open.');

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [];

const toNumberOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toAttachment = (value: unknown): RunAttachment =>
  isRecord(value) &&
  (value.kind === 'project' || value.kind === 'synced') &&
  typeof value.id === 'string'
    ? { kind: value.kind, id: value.id }
    : null;

const toStepState = (value: unknown): Record<string, RunStepPlace> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, place]) =>
          isRecord(place) && typeof place.order === 'number'
            ? [
                [
                  id,
                  {
                    order: place.order,
                    groupId: toText(place.groupId),
                    doneAt: toNumberOrNull(place.doneAt),
                    isExtra: place.isExtra === true,
                  },
                ],
              ]
            : [],
        ),
      )
    : {};

const toSteps = (value: unknown): Record<string, StepBody> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, step]) =>
          isRecord(step)
            ? [
                [
                  id,
                  {
                    text: toText(step.text) ?? '',
                    detail: toText(step.detail),
                  },
                ],
              ]
            : [],
        ),
      )
    : {};

const toGroups = (value: unknown): Record<string, { name: string }> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, group]) =>
          isRecord(group) ? [[id, { name: toText(group.name) ?? '' }]] : [],
        ),
      )
    : {};

/** A run that won't open is skipped, so a half-written one never shows as a blank row. */
async function openRun(
  entry: DocumentSnapshot,
  read: SealedReader,
): Promise<OpenRun | null> {
  const data = entry.data() as Partial<ProcedureRun> | undefined;
  try {
    if (!data?.sealed) return null;
    const payload = await read<Partial<RunSealed>>(data.sealed);
    return {
      id: entry.id,
      procedureId: toText(data.procedureId) ?? '',
      procedureVersion: data.procedureVersion ?? 1,
      attachedTo: toAttachment(data.attachedTo),
      dueOn: toNumberOrNull(data.dueOn),
      stepState: toStepState(data.stepState),
      groupOrder: toIds(data.groupOrder),
      startedAt: data.startedAt ?? 0,
      finishedAt: toNumberOrNull(data.finishedAt),
      createdBy: data.createdBy === 'nomos' ? 'nomos' : 'person',
      executionId: data.executionId ?? null,
      lastEditedAt: toNumberOrNull(data.lastEditedAt),
      title: toText(payload.title) ?? '',
      steps: toSteps(payload.steps),
      groups: toGroups(payload.groups),
      attachedLabel: toText(payload.attachedLabel),
    };
  } catch {
    return null;
  }
}

/** Listens to a query's runs. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
function listenToRuns(
  source: Query,
  read: SealedReader,
  onChange: (runs: OpenRun[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    source,
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openRun(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened.filter((entry): entry is OpenRun => entry !== null));
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}

const runsOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'procedureRuns');

/** Every run still going, up to the cap. */
export const startOpenRunsListener = (
  uid: string,
  read: SealedReader,
  onChange: (runs: OpenRun[]) => void,
  onError: (error: Error) => void,
) =>
  listenToRuns(
    query(runsOf(uid), where('finishedAt', '==', null), limit(RUNS_OPEN_LIMIT)),
    read,
    onChange,
    onError,
  );

/** One procedure's or one thing's runs, newest first, up to `max`. Started only while a page that lists them is open. */
export const startRunsListener = (
  uid: string,
  field: 'procedureId' | 'attachedTo.id',
  id: string,
  read: SealedReader,
  onChange: (runs: OpenRun[]) => void,
  onError: (error: Error) => void,
  max: number,
) =>
  listenToRuns(
    query(
      runsOf(uid),
      where(field, '==', id),
      orderBy('startedAt', 'desc'),
      limit(max),
    ),
    read,
    onChange,
    onError,
  );

/** One run, or null once it is gone or won't open. */
export function startRunListener(
  uid: string,
  runId: string,
  read: SealedReader,
  onChange: (run: OpenRun | null, isMissing: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    doc(runsOf(uid), runId),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = snapshot.exists() ? await openRun(snapshot, read) : null;
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened, !snapshot.exists());
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
