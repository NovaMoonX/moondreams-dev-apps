import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import {
  PROCEDURE_VERSIONS_KEPT,
  PROCEDURES_LIMIT,
} from '@apps/helm/constants';
import type {
  OpenProcedure,
  OpenProcedureVersion,
  Procedure,
  ProcedureSealed,
  ProcedureVersion,
  ProcedureVersionSealed,
} from '@apps/helm/types';
import type { StepBody, StepPlace } from '@apps/helm/utils/stepGroups';
import { readPrivacy } from '@apps/helm/utils/privacy';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your procedures did not open.');

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

const toIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStepState = (value: unknown): Record<string, StepPlace> =>
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

const toBody = (payload: Partial<ProcedureSealed>): ProcedureSealed => ({
  title: toText(payload.title) ?? '',
  steps: toSteps(payload.steps),
  groups: toGroups(payload.groups),
  privateMark: payload.privateMark ?? null,
  isPrivacyCleared: payload.isPrivacyCleared ?? null,
});

/** A procedure that won't open is skipped, so a half-written one never shows as a blank row. */
async function openProcedure(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenProcedure | null> {
  const data = entry.data() as Partial<Procedure>;
  try {
    if (!data.sealed) return null;
    const payload = await read<Partial<ProcedureSealed>>(data.sealed);
    return {
      id: entry.id,
      stepState: toStepState(data.stepState),
      groupOrder: toIds(data.groupOrder),
      version: data.version ?? 1,
      createdBy: data.createdBy === 'nomos' ? 'nomos' : 'person',
      sourceCaptureId: data.sourceCaptureId ?? null,
      sourceTaskId: data.sourceTaskId ?? null,
      executionId: data.executionId ?? null,
      createdAt: data.createdAt ?? 0,
      privacy: readPrivacy(data.privacy),
      lastEditedAt: data.lastEditedAt ?? null,
      ...toBody(payload),
      privateMark: payload.privateMark ?? null,
      isPrivacyCleared: payload.isPrivacyCleared ?? false,
    };
  } catch {
    return null;
  }
}

/** Every procedure the person has, up to the cap. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startProceduresListener(
  uid: string,
  read: SealedReader,
  onChange: (procedures: OpenProcedure[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'procedures'),
      orderBy('createdAt', 'desc'),
      limit(PROCEDURES_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openProcedure(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(
        opened.filter(
          (procedure): procedure is OpenProcedure => procedure !== null,
        ),
      );
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}

async function openVersion(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenProcedureVersion | null> {
  const data = entry.data() as Partial<ProcedureVersion>;
  try {
    if (!data.sealed) return null;
    const payload = await read<Partial<ProcedureVersionSealed>>(data.sealed);
    return {
      id: entry.id,
      version: data.version ?? Number(entry.id),
      restoredFromVersion: data.restoredFromVersion ?? null,
      createdBy: data.createdBy === 'person' ? 'person' : 'nomos',
      reason: data.reason ?? 'personEdit',
      stepState: toStepState(data.stepState),
      groupOrder: toIds(data.groupOrder),
      sourceCaptureId: data.sourceCaptureId ?? null,
      executionId: data.executionId ?? null,
      createdAt: data.createdAt ?? 0,
      ...toBody(payload),
      changeSummary: toText(payload.changeSummary) ?? '',
      requestQuote: toText(payload.requestQuote),
    };
  } catch {
    return null;
  }
}

/** One procedure's versions, newest first, up to `max`. Started only while History or the procedure's own page is open. */
export function startProcedureVersionsListener(
  uid: string,
  procedureId: string,
  read: SealedReader,
  onChange: (versions: OpenProcedureVersion[]) => void,
  onError: (error: Error) => void,
  max: number = PROCEDURE_VERSIONS_KEPT,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(
        db,
        'apps',
        'helm',
        'users',
        uid,
        'procedures',
        procedureId,
        'versions',
      ),
      orderBy('version', 'desc'),
      limit(max),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openVersion(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(
        opened.filter(
          (version): version is OpenProcedureVersion => version !== null,
        ),
      );
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
