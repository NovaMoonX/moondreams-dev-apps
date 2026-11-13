import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { SealedPayload } from '../../appKeys/seal.js';
import { HELM_MASTER_KEYS } from './getHelmKey.js';
import { openForHelm, sealForHelm, unwrapHelmKey } from './helmKey.js';
import { loadKeyringOrFail } from './sortHelmCapture.js';
import type { QuestionStateEntry } from './nomos/executeCommands.js';
import { openKeyDate } from './sortHelmCapture.js';
import { openTopicRecord } from './noteStore.js';
import {
  openLiveTopic,
  readVersionNumbers,
  writeTopicVersionIn,
  type LiveTopic,
} from './topicVersionStore.js';
import type { PlacedTopic } from './nomos/planTopicCommands.js';
import { MAX_CONTEXT_TOPICS } from './nomos/commands.js';
import { NOTE_TOPICS_CAP } from './nomos/commands.js';
import type { NoteTopicState } from './nomos/executeCommands.js';
import { readIndexIn, writeIndexIn } from './keyDateStore.js';
import { applyChanges } from './keyDateIndex.js';
import { KEY_DATE_INCOMING_ID } from './nomos/summaries.js';
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
    : refusal === 'noteGone'
      ? new HttpsError('failed-precondition', 'That note is gone.', {
          reason: 'gone',
        })
      : refusal === 'topicGone'
        ? new HttpsError('failed-precondition', 'Those topics were removed.', {
            reason: 'gone',
          })
        : refusal === 'unknown'
          ? new HttpsError('invalid-argument', 'That answer is not valid.')
          : refusal === 'groupChanged'
            ? new HttpsError(
                'failed-precondition',
                'Those topics changed since.',
                {
                  reason: 'gone',
                },
              )
            : refusal === 'changed'
              ? new HttpsError(
                  'failed-precondition',
                  'That date changed since.',
                  {
                    reason: 'gone',
                  },
                )
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

const toResolveNote = (
  key: Parameters<typeof openForHelm>[0],
  snap: { exists: boolean; get: (field: string) => unknown } | null,
) => {
  if (!snap?.exists) return null;
  try {
    const words = openForHelm(key, snap.get('sealed') as SealedPayload);
    const topicIds = snap.get('topicIds');
    return typeof words.title === 'string'
      ? {
          title: words.title,
          topicIds: isStringList(topicIds) ? topicIds : [],
        }
      : null;
  } catch {
    return null;
  }
};

const readInput = (data: unknown) => {
  const raw = (data ?? {}) as Record<string, unknown>;
  const answer = (raw.answer ?? {}) as Record<string, unknown>;
  const { captureId, questionId } = raw;
  const { by, optionId, optionIds, text } = answer;
  const isMany =
    Array.isArray(optionIds) &&
    optionIds.length >= 1 &&
    optionIds.length <= NOTE_TOPICS_CAP &&
    optionIds.every((id) => typeof id === 'string' && ID_RE.test(id));
  const note =
    typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : null;
  if (
    optionIds !== undefined &&
    (!isMany || optionId !== undefined || text !== undefined)
  ) {
    throw new HttpsError('invalid-argument', 'That answer is not valid.');
  }
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
    (!isMany && (typeof optionId !== 'string' || !ID_RE.test(optionId)))
  ) {
    throw new HttpsError('invalid-argument', 'That answer is not valid.');
  }
  return {
    captureId,
    questionId,
    by: by as 'tap' | 'voice',
    optionId: isMany ? '' : (optionId as string),
    optionIds: isMany ? (optionIds as string[]) : [],
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
    const { captureId, questionId, by, optionId, optionIds, text } = readInput(
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
            noteId?: unknown;
            childIds?: unknown;
            kind?: string;
          }[];
        }
      >;
      const held = questions[questionId]?.heldCommands?.[0];
      const taskIds = (held?.taskIds ?? []).filter(
        (id): id is string => typeof id === 'string' && ID_RE.test(id),
      );
      const isFileNote = held?.kind === 'fileNote';
      const noteId =
        isFileNote &&
        typeof held?.noteId === 'string' &&
        ID_RE.test(held.noteId)
          ? held.noteId
          : null;
      const groupIds =
        held?.kind === 'groupTopics' && Array.isArray(held.childIds)
          ? (held.childIds as unknown[])
              .filter(
                (id): id is string => typeof id === 'string' && ID_RE.test(id),
              )
              .slice(0, 20)
          : [];
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
        groupIds.length === 0 &&
        held?.kind !== 'groupTopics' &&
        !isSettle &&
        !isDateSettle &&
        !isFileNote &&
        optionId !== 'new' &&
        optionId !== 'none';
      const keyDateSnap = keyDateId
        ? await transaction.get(firestore.doc(`${base}/keyDates/${keyDateId}`))
        : null;
      const openedDate =
        keyDateSnap?.exists === true ? openKeyDate(key, keyDateSnap) : null;
      const isYearlySettle =
        optionId === KEY_DATE_INCOMING_ID && openedDate?.[1].shape === 'yearly';
      const dateIndex = isYearlySettle
        ? await readIndexIn(transaction, firestore, base, key)
        : null;
      const [noteSnap, topicSnaps] = await Promise.all([
        noteId
          ? transaction.get(firestore.doc(`${base}/notes/${noteId}`))
          : null,
        Promise.all(
          (noteId ? [...new Set(optionIds)] : []).map((id) =>
            transaction.get(firestore.doc(`${base}/topics/${id}`)),
          ),
        ),
      ]);
      const noteWords = toResolveNote(key, noteSnap);
      const isGroupYes = groupIds.length > 0 && optionId === 'yes';
      const [groupSnaps, treeSnap] = await Promise.all([
        Promise.all(
          (isGroupYes ? groupIds : []).map((id) =>
            transaction.get(firestore.doc(`${base}/topics/${id}`)),
          ),
        ),
        isGroupYes
          ? transaction.get(
              firestore
                .collection(`${base}/topics`)
                .select('parentId', 'depth')
                .limit(MAX_CONTEXT_TOPICS),
            )
          : null,
      ]);
      const groupTopics = new Map<string, LiveTopic>(
        groupSnaps.flatMap((snap): [string, LiveTopic][] => {
          const data = snap.data();
          const topic = data ? openLiveTopic(key, snap.id, data) : null;
          return topic ? [[snap.id, topic]] : [];
        }),
      );
      const groupVersions = new Map<string, number[]>(
        await Promise.all(
          [...groupTopics.keys()].map(
            async (id): Promise<[string, number[]]> => [
              id,
              await readVersionNumbers(
                transaction,
                firestore.doc(`${base}/topics/${id}`),
              ),
            ],
          ),
        ),
      );
      const groupTree: PlacedTopic[] = (treeSnap?.docs ?? []).map((doc) => ({
        id: doc.id,
        parentId:
          typeof doc.get('parentId') === 'string'
            ? (doc.get('parentId') as string)
            : null,
        depth: Number(doc.get('depth') ?? 1),
        name: groupTopics.get(doc.id)?.name ?? '',
      }));
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
        optionIds,
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
        note: noteWords,
        topics: new Map<string, NoteTopicState>(
          topicSnaps.flatMap((snap): [string, NoteTopicState][] => {
            const data = snap.data();
            const topic = data ? openTopicRecord(key, snap.id, data) : null;
            return topic
              ? [
                  [
                    snap.id,
                    {
                      name: topic.name,
                      path: topic.name,
                      docState: topic.docState,
                      pendingNoteIds: topic.pendingNoteIds,
                    },
                  ],
                ]
              : [];
          }),
        ),
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
        group: isGroupYes
          ? { topics: groupTopics, tree: groupTree }
          : undefined,
        newId: () =>
          held?.kind === 'groupTopics'
            ? firestore.collection(`${base}/topics`).doc().id
            : firestore
                .collection(`${base}/${isPlace ? 'places' : 'who'}`)
                .doc().id,
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
      if (plan.noteUpdate) {
        transaction.update(
          firestore.doc(`${base}/notes/${plan.noteUpdate.id}`),
          plan.noteUpdate.data,
        );
      }
      plan.topicUpdates.forEach(({ id, docState, addPendingIds }) =>
        transaction.update(firestore.doc(`${base}/topics/${id}`), {
          docState,
          ...(addPendingIds.length > 0 && {
            pendingNoteIds: FieldValue.arrayUnion(...addPendingIds),
          }),
        }),
      );
      if (plan.groupWrite) {
        const now = Date.now();
        plan.groupWrite.versions.forEach((version) => {
          const live = groupTopics.get(version.topicId);
          if (!live) return;
          writeTopicVersionIn(transaction, {
            topicRef: firestore.doc(`${base}/topics/${version.topicId}`),
            currentVersion: version.currentVersion,
            existingVersions: groupVersions.get(version.topicId) ?? [],
            currentWords: live.words,
            sections: version.sections,
            reason: version.reason,
            noteIds: version.noteIds,
            sourceCaptureId: version.sourceCaptureId,
            executionId: version.executionId,
            changeSummary: version.changeSummary,
            requestQuote: version.requestQuote,
            parentName: version.parentName,
            docState: version.docState,
            pendingNoteIds: version.pendingNoteIds,
            topicFields: version.topicFields,
            now,
            seal,
          });
        });
        const versioned = new Set(
          plan.groupWrite.versions.map((version) => version.topicId),
        );
        plan.groupWrite.placements
          .filter(({ id }) => !versioned.has(id))
          .forEach(({ id, parentId, depth }) =>
            transaction.update(firestore.doc(`${base}/topics/${id}`), {
              parentId,
              depth,
            }),
          );
        transaction.create(
          firestore.doc(`${base}/topics/${plan.groupWrite.parentCreate.id}`),
          plan.groupWrite.parentCreate.data,
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
      return {
        executionId: plan.execution ? executionRef.id : null,
        isStale: plan.isStale,
      };
    });
  },
);
