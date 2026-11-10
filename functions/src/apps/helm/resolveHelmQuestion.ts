import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { SealedPayload } from '../../appKeys/seal.js';
import { HELM_MASTER_KEYS } from './getHelmKey.js';
import { openForHelm, sealForHelm, unwrapHelmKey } from './helmKey.js';
import { loadKeyringOrFail } from './sortHelmCapture.js';
import type { QuestionStateEntry } from './nomos/executeCommands.js';
import {
  planResolve,
  type ResolveRefusal,
  type ResolveTask,
} from './nomos/resolveQuestion.js';

if (getApps().length === 0) {
  initializeApp();
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

interface ResolveResult {
  executionId: string | null;
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

const toRefusal = (refusal: ResolveRefusal, isPlace: boolean) =>
  refusal === 'answered'
    ? new HttpsError('already-exists', 'This was already answered.')
    : refusal === 'unknown'
      ? new HttpsError('invalid-argument', 'That answer is not valid.')
      : new HttpsError(
          'failed-precondition',
          isPlace
            ? 'That place was removed.'
            : 'That person was removed.',
        );

const openOrRefuse = (
  key: Parameters<typeof openForHelm>[0],
  sealed: SealedPayload,
) => {
  try {
    return openForHelm(key, sealed);
  } catch {
    throw new HttpsError('failed-precondition', 'This capture is gone.');
  }
};

const readInput = (data: unknown) => {
  const raw = (data ?? {}) as Record<string, unknown>;
  const answer = (raw.answer ?? {}) as Record<string, unknown>;
  const { captureId, questionId } = raw;
  const { by, optionId } = answer;
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
  return { captureId, questionId, by: by as 'tap' | 'voice', optionId };
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
    const { captureId, questionId, by, optionId } = readInput(request.data);
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
      const captureSnap = await transaction.get(captureRef);
      const capture = captureSnap.data() as CaptureDoc | undefined;
      if (!capture) throw new HttpsError('not-found', 'This capture is gone.');
      const opened = openOrRefuse(key, capture.sealed);
      const questions = (opened.questions ?? {}) as Record<
        string,
        { heldCommands?: { taskIds?: unknown[]; kind?: string }[] }
      >;
      const held = questions[questionId]?.heldCommands?.[0];
      const taskIds = (held?.taskIds ?? []).filter(
        (id): id is string => typeof id === 'string' && ID_RE.test(id),
      );
      const isPlace = held?.kind === 'linkPlace';
      const isPick = optionId !== 'new' && optionId !== 'none';
      const [taskSnaps, chosenSnap] = await Promise.all([
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
      const executionRef = firestore.collection(`${base}/executions`).doc();
      const result = planResolve({
        captureId,
        questionId,
        optionId,
        by,
        now: Date.now(),
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
        chosen:
          chosenSnap?.exists === true
            ? {
                tier: chosenSnap.get('tier') ?? 'passing',
                tierSetBy: chosenSnap.get('tierSetBy') ?? 'nomos',
              }
            : null,
        newId: () =>
          firestore.collection(`${base}/${isPlace ? 'places' : 'who'}`).doc()
            .id,
        seal,
      });
      if (result.refused !== null) {
        throw toRefusal(result.refused, isPlace);
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
      return { executionId: plan.execution ? executionRef.id : null };
    });
  },
);
