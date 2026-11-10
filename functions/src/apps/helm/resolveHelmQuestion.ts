import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { SealedPayload } from '../../appKeys/seal.js';
import { HELM_MASTER_KEYS } from './getHelmKey.js';
import { openForHelm, sealForHelm, unwrapHelmKey } from './helmKey.js';
import { loadKeyringOrFail } from './sortHelmCapture.js';
import type { QuestionStateEntry } from './nomos/executeCommands.js';
import { openKeyDate } from './sortHelmCapture.js';
import { readIndexIn, writeIndexIn } from './keyDateStore.js';
import { applyChanges } from './keyDateIndex.js';
import {
  FACT_TEXT_MAX,
  planResolve,
  type ResolveFact,
  type ResolveRefusal,
  type ResolveTask,
} from './nomos/resolveQuestion.js';

if (getApps().length === 0) {
  initializeApp();
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

interface ResolveResult {
  executionId: string | null;
  isStale: boolean;
}

interface CaptureDoc {
  status: string;
  createdAt: number;
  whoIds?: string[];
  placeIds?: string[];
  executionIds?: string[];
  questionState?: Record<string, QuestionStateEntry>;
  sealed: SealedPayload;
}

const toRefusal = (
  refusal: ResolveRefusal,
  subject: 'person' | 'place' | 'fact' | 'date',
) =>
  refusal === 'answered'
    ? new HttpsError('already-exists', 'This was already answered.')
    : refusal === 'unknown'
      ? new HttpsError('invalid-argument', 'That answer is not valid.')
      : new HttpsError(
          'failed-precondition',
          subject === 'fact'
            ? 'That fact changed since.'
            : subject === 'date'
              ? 'That date was removed.'
              : subject === 'place'
                ? 'That place was removed.'
                : 'That person was removed.',
          { reason: 'gone' },
        );

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const toFact = (
  data: Record<string, unknown>,
  words: Record<string, unknown>,
): ResolveFact | null => {
  const num = (value: unknown) => (typeof value === 'number' ? value : null);
  const str = (value: unknown) => (typeof value === 'string' ? value : null);
  const list = (value: unknown) => (isStringList(value) ? value : []);
  return typeof words.statement === 'string'
    ? {
        status: str(data.status) ?? 'inferred',
        kind: str(data.kind) ?? 'world',
        statement: words.statement,
        topic: str(words.topic),
        createdAt: num(data.createdAt) ?? 0,
        confirmedAt: num(data.confirmedAt),
        supersedesId: str(data.supersedesId),
        supersededById: str(data.supersededById),
        supersededAt: num(data.supersededAt),
        disputedWithId: str(data.disputedWithId),
        whoIds: list(data.whoIds),
        placeIds: list(data.placeIds),
        projectIds: list(data.projectIds),
        syncedIds: list(data.syncedIds),
        subjectIds: list(data.subjectIds),
      }
    : null;
};

const openOrRefuse = (
  key: Parameters<typeof openForHelm>[0],
  sealed: SealedPayload,
  message = 'This capture is gone.',
) => {
  try {
    return openForHelm(key, sealed);
  } catch {
    throw new HttpsError('failed-precondition', message);
  }
};

const readInput = (data: unknown) => {
  const raw = (data ?? {}) as Record<string, unknown>;
  const answer = (raw.answer ?? {}) as Record<string, unknown>;
  const { captureId, questionId } = raw;
  const { by, optionId, text } = answer;
  const note =
    typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : null;
  if (
    text !== undefined &&
    (optionId !== 'none' ||
      note === null ||
      note === '' ||
      note.length > FACT_TEXT_MAX)
  ) {
    throw new HttpsError('invalid-argument', 'That answer is not valid.');
  }
  if (
    typeof captureId !== 'string' ||
    !ID_RE.test(captureId) ||
    typeof questionId !== 'string' ||
    !ID_RE.test(questionId) ||
    (by !== 'tap' && by !== 'voice') ||
    typeof optionId !== 'string' ||
    !ID_RE.test(optionId)
  ) {
    throw new HttpsError('invalid-argument', 'That answer is not valid.');
  }
  return {
    captureId,
    questionId,
    by: by as 'tap' | 'voice',
    optionId,
    text: note,
  };
};

export const resolveHelmQuestion = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    minInstances: 0,
    timeoutSeconds: 30,
    enforceAppCheck: true,
    secrets: [HELM_MASTER_KEYS],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<ResolveResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
    }
    const { captureId, questionId, by, optionId, text } = readInput(
      request.data,
    );
    const firestore = getFirestore();
    const base = `apps/helm/users/${uid}`;
    const captureRef = firestore.doc(`${base}/captures/${captureId}`);
    const key = await unwrapHelmKey(firestore, loadKeyringOrFail(), uid).catch(
      () => {
        throw new HttpsError(
          'failed-precondition',
          "Helm can't open your things right now.",
        );
      },
    );
    const seal = (fields: Record<string, unknown>) => sealForHelm(key, fields);

    return firestore.runTransaction(async (transaction) => {
      const [captureSnap, profileSnap] = await Promise.all([
        transaction.get(captureRef),
        transaction.get(firestore.doc(base)),
      ]);
      const capture = captureSnap.data() as CaptureDoc | undefined;
      if (!capture) throw new HttpsError('not-found', 'This capture is gone.');
      const opened = openOrRefuse(key, capture.sealed);
      const questions = (opened.questions ?? {}) as Record<
        string,
        {
          heldCommands?: {
            taskIds?: unknown[];
            factIds?: unknown[];
            keyDateId?: unknown;
            kind?: string;
          }[];
        }
      >;
      const held = questions[questionId]?.heldCommands?.[0];
      const taskIds = (held?.taskIds ?? []).filter(
        (id): id is string => typeof id === 'string' && ID_RE.test(id),
      );
      const isPlace = held?.kind === 'linkPlace';
      const isSettle = held?.kind === 'settleFact';
      const isDateSettle = held?.kind === 'settleKeyDate';
      const keyDateId =
        isDateSettle &&
        typeof held?.keyDateId === 'string' &&
        ID_RE.test(held.keyDateId)
          ? held.keyDateId
          : null;
      const factIds = (held?.factIds ?? [])
        .filter((id): id is string => typeof id === 'string' && ID_RE.test(id))
        .slice(0, 2);
      const isPick =
        !isSettle && !isDateSettle && optionId !== 'new' && optionId !== 'none';
      const keyDateSnap = keyDateId
        ? await transaction.get(firestore.doc(`${base}/keyDates/${keyDateId}`))
        : null;
      const openedDate =
        keyDateSnap?.exists === true ? openKeyDate(key, keyDateSnap) : null;
      const isYearlySettle =
        optionId === 'new' && openedDate?.[1].shape === 'yearly';
      const dateIndex = isYearlySettle
        ? await readIndexIn(transaction, firestore, base, key)
        : null;
      const [factSnaps, taskSnaps, chosenSnap] = await Promise.all([
        Promise.all(
          factIds.map((id) =>
            transaction.get(firestore.doc(`${base}/facts/${id}`)),
          ),
        ),
        Promise.all(
          taskIds.map((id) =>
            transaction.get(firestore.doc(`${base}/tasks/${id}`)),
          ),
        ),
        isPick
          ? transaction.get(
              firestore.doc(
                `${base}/${isPlace ? 'places' : 'who'}/${optionId}`,
              ),
            )
          : null,
      ]);
      const tasks = new Map<string, ResolveTask>(
        taskSnaps.flatMap((snap): [string, ResolveTask][] => {
          const data = snap.data() as
            | { whoIds?: string[]; placeIds?: string[]; sealed: SealedPayload }
            | undefined;
          if (!data) return [];
          try {
            const title = openForHelm(key, data.sealed).title;
            return typeof title === 'string'
              ? [
                  [
                    snap.id,
                    {
                      title,
                      whoIds: data.whoIds ?? [],
                      placeIds: data.placeIds ?? [],
                    },
                  ],
                ]
              : [];
          } catch {
            return [];
          }
        }),
      );
      const facts = new Map<string, ResolveFact>(
        factSnaps.flatMap((snap): [string, ResolveFact][] => {
          const data = snap.data();
          if (!data) return [];
          const fact = toFact(
            data,
            openOrRefuse(key, data.sealed, 'That fact is not readable.'),
          );
          if (!fact) {
            throw new HttpsError(
              'failed-precondition',
              'That fact is not readable.',
            );
          }
          return [[snap.id, fact]];
        }),
      );
      const executionRef = firestore.collection(`${base}/executions`).doc();
      const result = planResolve({
        captureId,
        questionId,
        optionId,
        by,
        now: Date.now(),
        timeZone: (profileSnap.data()?.timeZone as string | undefined) ?? 'UTC',
        executionId: executionRef.id,
        capture: {
          status: capture.status,
          createdAt: capture.createdAt,
          whoIds: capture.whoIds ?? [],
          placeIds: capture.placeIds ?? [],
          executionIds: capture.executionIds ?? [],
          questionState: capture.questionState ?? {},
        },
        opened,
        tasks,
        facts,
        keyDate: openedDate
          ? {
              id: openedDate[0],
              record: {
                ...openedDate[1],
                lastEditedAt: Number.isFinite(keyDateSnap?.get('lastEditedAt'))
                  ? Number(keyDateSnap?.get('lastEditedAt'))
                  : null,
              },
            }
          : null,
        text,
        chosen:
          chosenSnap?.exists === true
            ? {
                tier: chosenSnap.get('tier') ?? 'passing',
                tierSetBy: chosenSnap.get('tierSetBy') ?? 'nomos',
                lastMentionedAt: Number.isFinite(
                  chosenSnap.get('lastMentionedAt'),
                )
                  ? Number(chosenSnap.get('lastMentionedAt'))
                  : null,
              }
            : null,
        newId: () =>
          firestore.collection(`${base}/${isPlace ? 'places' : 'who'}`).doc()
            .id,
        seal,
      });
      if (result.refused !== null) {
        throw toRefusal(
          result.refused,
          isSettle
            ? 'fact'
            : isDateSettle
              ? 'date'
              : isPlace
                ? 'place'
                : 'person',
        );
      }
      const { plan } = result;
      plan.taskUpdates.forEach(({ id, data }) =>
        transaction.update(firestore.doc(`${base}/tasks/${id}`), data),
      );
      if (plan.whoCreate) {
        transaction.create(
          firestore.doc(`${base}/who/${plan.whoCreate.id}`),
          plan.whoCreate.data,
        );
      }
      if (plan.placeCreate) {
        transaction.create(
          firestore.doc(`${base}/places/${plan.placeCreate.id}`),
          plan.placeCreate.data,
        );
      }
      plan.factUpdates.forEach(({ id, data }) =>
        transaction.update(firestore.doc(`${base}/facts/${id}`), data),
      );
      if (plan.factCreate) {
        transaction.create(
          firestore.doc(`${base}/facts/${plan.factCreate.id}`),
          plan.factCreate.data,
        );
      }
      if (plan.keyDateUpdate) {
        transaction.update(
          firestore.doc(`${base}/keyDates/${plan.keyDateUpdate.id}`),
          plan.keyDateUpdate.data,
        );
        if (plan.keyDateUpdate.indexChange && dateIndex) {
          const next = applyChanges(dateIndex.byWho, [
            plan.keyDateUpdate.indexChange,
          ]);
          writeIndexIn(transaction, firestore, base, {
            byWho: next.byWho,
            rebuiltAt: dateIndex.rebuiltAt,
            existingIds: dateIndex.existingIds,
            now: Date.now(),
            seal,
          });
        }
      }
      if (plan.whoUpdate) {
        transaction.update(
          firestore.doc(`${base}/who/${plan.whoUpdate.id}`),
          plan.whoUpdate.data,
        );
      }
      if (plan.execution) transaction.create(executionRef, plan.execution);
      transaction.update(captureRef, {
        ...plan.capture,
        sealed: seal(plan.capture.sealed as Record<string, unknown>),
      });
      return {
        executionId: plan.execution ? executionRef.id : null,
        isStale: plan.isStale,
      };
    });
  },
);
