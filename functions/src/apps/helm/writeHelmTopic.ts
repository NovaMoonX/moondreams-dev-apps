import { randomUUID } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { ModelProvider } from '../../ai/modelProvider.js';
import type { SealedPayload } from '../../appKeys/seal.js';
import { isForcedFixture } from '../../emulator.js';
import { HELM_MASTER_KEYS } from './getHelmKey.js';
import {
  openForHelm,
  sealForHelm,
  unwrapHelmKey,
  type HelmKey,
} from './helmKey.js';
import {
  releaseTopicWrite,
  reserveAiCall,
  reserveTopicWrite,
} from './aiLimits.js';
import {
  askTopicModel,
  pickTopicProvider,
  TOPIC_LOOP_LIMITS,
} from './topicModel.js';
import { AUTOMATIC_LEVEL } from './nomos/policy.js';
import { ANTHROPIC_API_KEY, loadKeyringOrFail } from './sortHelmCapture.js';
import {
  readVersionNumbers,
  toIds,
  toSections,
  toTopicDoc,
  writeTopicVersionIn,
  type TopicDoc,
} from './topicVersionStore.js';
import {
  MAX_FILED_READ,
  MAX_OVERVIEW_CHARS,
  SUBMIT_OVERVIEW_TOOL,
  SUBMIT_TOPIC_TOOL,
  TOPIC_OVERVIEW_PROMPT,
  TOPIC_WRITE_PROMPT,
  applyTopicChanges,
  buildChangeSummary,
  buildOverviewMessage,
  buildWriteMessage,
  decideClaim,
  pickPendingNotes,
  dropGoneSources,
  pickReason,
  readChanges,
  sourceNoteId,
  toNoteSource,
  type DocState,
  type TopicSection,
  type TopicSource,
} from './topicWrite.js';

if (getApps().length === 0) {
  initializeApp();
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_CHILDREN_READ = 20;
const OUTLINE_CHARS = 300;
const OVERVIEW_LIMITS = { ...TOPIC_LOOP_LIMITS, maxMillis: 20_000 };

export interface WriteTopicResult {
  status: 'written' | 'current' | 'busy' | 'limited' | 'failed';
  version: number;
  broughtIn: number;
  waiting: number;
  retry: 'soon' | 'tomorrow' | null;
}

const result = (
  status: WriteTopicResult['status'],
  topic: Pick<TopicDoc, 'version' | 'pendingNoteIds'>,
  broughtIn = 0,
  waiting: number = topic.pendingNoteIds.length,
  retry: WriteTopicResult['retry'] = null,
): WriteTopicResult => ({
  status,
  version: topic.version,
  broughtIn,
  waiting,
  retry,
});

type Claimed =
  | { kind: 'claimed'; claimId: string; topic: TopicDoc }
  | { kind: 'settled'; response: WriteTopicResult };

async function claimTopic(
  firestore: Firestore,
  base: string,
  topicRef: DocumentReference,
  topicId: string,
  now: number,
): Promise<Claimed> {
  return firestore.runTransaction(async (transaction): Promise<Claimed> => {
    const snapshot = await transaction.get(topicRef);
    const data = snapshot.data();
    if (!data) throw new HttpsError('not-found', 'This topic is gone.');
    const topic = toTopicDoc(data);
    const needsFiled = topic.version === 0 && topic.pendingNoteIds.length === 0;
    const filed = needsFiled
      ? (
          await transaction.get(
            firestore
              .collection(`${base}/notes`)
              .where('topicIds', 'array-contains', topicId)
              .limit(MAX_FILED_READ),
          )
        ).docs.map((doc) => ({
          id: doc.id,
          createdAt: Number(doc.get('createdAt') ?? 0),
        }))
      : [];
    const decision = decideClaim({
      docState: topic.docState,
      version: topic.version,
      writeClaim: topic.writeClaim,
      pendingCount: topic.pendingNoteIds.length,
      filedCount: filed.length,
      now,
    });
    if (decision !== 'claim') {
      return { kind: 'settled', response: result(decision, topic) };
    }
    const claimId = randomUUID();
    const pendingNoteIds =
      filed.length > 0
        ? [...pickPendingNotes(filed, MAX_FILED_READ).taken]
        : topic.pendingNoteIds;
    transaction.update(topicRef, {
      writeClaim: { claimId, at: now },
      docState: 'writing',
      pendingNoteIds,
    });
    return {
      kind: 'claimed',
      claimId,
      topic: { ...topic, pendingNoteIds },
    };
  });
}

const release = (
  firestore: Firestore,
  topicRef: DocumentReference,
  claimId: string,
  docState: DocState,
) =>
  firestore.runTransaction(async (transaction) => {
    const claim = (await transaction.get(topicRef)).get('writeClaim') as {
      claimId?: string;
    } | null;
    if (claim?.claimId === claimId) {
      transaction.update(topicRef, { writeClaim: null, docState });
    }
  });

const readApiKey = () => {
  if (isForcedFixture('anthropic')) return '';
  try {
    return ANTHROPIC_API_KEY.value();
  } catch {
    return '';
  }
};

const askModel = askTopicModel;

const openWords = (key: HelmKey, sealed: SealedPayload) =>
  openForHelm(key, sealed);

interface NoteWords {
  id: string;
  title: string;
  body: string;
  isUnchecked: boolean;
  createdAt: number;
  source: string;
  isFromGeneralAnswer: boolean;
  sourceCaptureId: string | null;
  sourceMediaId: string | null;
}

async function readPendingNotes(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  topicId: string,
  pendingIds: string[],
) {
  const unique = [...new Set(pendingIds.filter((id) => ID_RE.test(id)))];
  const snapshots =
    unique.length > 0
      ? await firestore.getAll(
          ...unique.map((id) => firestore.doc(`${base}/notes/${id}`)),
        )
      : [];
  const opened = snapshots.flatMap((snapshot): NoteWords[] => {
    const data = snapshot.data();
    if (!data || !toIds(data.topicIds).includes(topicId)) return [];
    try {
      const words = openWords(key, data.sealed as SealedPayload);
      return typeof words.title === 'string' && typeof words.body === 'string'
        ? [
            {
              id: snapshot.id,
              title: words.title,
              body: words.body,
              isUnchecked:
                data.isFromGeneralAnswer === true && data.checkedAt == null,
              createdAt: Number(data.createdAt ?? 0),
              source: String(data.source ?? 'typed'),
              isFromGeneralAnswer: data.isFromGeneralAnswer === true,
              sourceCaptureId:
                typeof data.sourceCaptureId === 'string'
                  ? data.sourceCaptureId
                  : null,
              sourceMediaId:
                typeof data.sourceMediaId === 'string'
                  ? data.sourceMediaId
                  : null,
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
  const { taken } = pickPendingNotes(opened);
  const byId = new Map(opened.map((note) => [note.id, note]));
  return taken.flatMap((id) => {
    const note = byId.get(id);
    return note ? [note] : [];
  });
}

async function readCaptureTimes(
  firestore: Firestore,
  base: string,
  notes: NoteWords[],
) {
  const ids = [
    ...new Set(
      notes.flatMap((note) =>
        note.sourceCaptureId && ID_RE.test(note.sourceCaptureId)
          ? [note.sourceCaptureId]
          : [],
      ),
    ),
  ];
  if (ids.length === 0) return new Map<string, number>();
  const snapshots = await firestore.getAll(
    ...ids.map((id) => firestore.doc(`${base}/captures/${id}`)),
    { fieldMask: ['createdAt'] },
  );
  return new Map(
    snapshots.flatMap((snapshot): [string, number][] =>
      typeof snapshot.get('createdAt') === 'number'
        ? [[snapshot.id, snapshot.get('createdAt') as number]]
        : [],
    ),
  );
}

async function readGoneNotes(
  firestore: Firestore,
  base: string,
  topicId: string,
  sections: TopicSection[],
) {
  const ids = [
    ...new Set(
      sections.flatMap((section) =>
        section.sources.flatMap((source) => {
          const id = sourceNoteId(source);
          return id && ID_RE.test(id) ? [id] : [];
        }),
      ),
    ),
  ];
  if (ids.length === 0) return new Set<string>();
  const snapshots = await firestore.getAll(
    ...ids.map((id) => firestore.doc(`${base}/notes/${id}`)),
    { fieldMask: ['topicIds'] },
  );
  return new Set(
    snapshots.flatMap((snapshot) =>
      snapshot.exists && toIds(snapshot.get('topicIds')).includes(topicId)
        ? []
        : [snapshot.id],
    ),
  );
}

const describeWrite = (name: string, reason: string, taken: number) =>
  reason === 'firstWritten'
    ? `Wrote the first version of ${name}`
    : reason === 'rearranged'
      ? `Rearranged ${name}`
      : reason === 'sourceRemoved'
        ? `Took out what a removed note said in ${name}`
        : `Brought ${taken} ${taken === 1 ? 'note' : 'notes'} into ${name}`;

const buildWriteExecution = (
  now: number,
  seal: (fields: Record<string, unknown>) => SealedPayload,
  summary: string,
) => ({
  captureId: null,
  actor: 'nomos',
  category: 'organize',
  autonomyLevel: AUTOMATIC_LEVEL,
  state: 'succeeded',
  effectRefs: [],
  linkedWhoIds: [],
  linkedPlaceIds: [],
  undoesExecutionId: null,
  undoneByExecutionId: null,
  questionRef: null,
  errorCode: null,
  createdAt: now,
  decidedAt: now,
  finishedAt: now,
  sealed: seal({
    summary,
    commands: [],
    effects: [],
    undoReport: null,
    abilityOffer: null,
    awayZoneOffer: null,
    spoken: null,
    goneIds: null,
    said: null,
    lines: null,
  }),
});

interface WriteInput {
  firestore: Firestore;
  uid: string;
  base: string;
  topicId: string;
  topicRef: DocumentReference;
  claimId: string;
  topic: TopicDoc;
  key: HelmKey;
  now: number;
}

async function writeClaimed(input: WriteInput): Promise<WriteTopicResult> {
  const { firestore, uid, base, topicId, topicRef, claimId, topic, key, now } =
    input;
  const words = openWords(key, topic.sealed);
  const name = typeof words.name === 'string' ? words.name : '';
  const sections = toSections(words);
  const [notes, gone] = await Promise.all([
    readPendingNotes(firestore, base, key, topicId, topic.pendingNoteIds),
    readGoneNotes(firestore, base, topicId, sections),
  ]);
  if (notes.length === 0) {
    const trimmed = dropGoneSources(sections, gone);
    const committed = trimmed.changed
      ? await firestore.runTransaction(async (transaction) => {
          const [snapshot, existingVersions] = await Promise.all([
            transaction.get(topicRef),
            readVersionNumbers(transaction, topicRef),
          ]);
          const data = snapshot.data();
          const current = data ? toTopicDoc(data) : null;
          if (
            !current ||
            current.version !== topic.version ||
            current.writeClaim?.claimId !== claimId
          ) {
            return null;
          }
          const executionRef = firestore.collection(`${base}/executions`).doc();
          const seal = (fields: Record<string, unknown>) =>
            sealForHelm(key, fields);
          const version = writeTopicVersionIn(transaction, {
            topicRef,
            currentVersion: current.version,
            existingVersions,
            currentWords: openWords(key, current.sealed),
            sections: trimmed.sections,
            reason: 'sourceRemoved',
            noteIds: [],
            sourceCaptureId: null,
            executionId: executionRef.id,
            changeSummary: buildChangeSummary('', 'sourceRemoved', 0),
            requestQuote: null,
            parentName: null,
            docState: 'current',
            pendingNoteIds: [],
            now,
            seal,
          });
          transaction.set(
            executionRef,
            buildWriteExecution(
              now,
              seal,
              describeWrite(name, 'sourceRemoved', 0),
            ),
          );
          return version;
        })
      : null;
    if (trimmed.changed) {
      if (!committed) throw new Error('topicMoved');
      return result(
        'written',
        { version: committed, pendingNoteIds: [] },
        0,
        0,
      );
    }
    await firestore.runTransaction(async (transaction) => {
      const claim = (await transaction.get(topicRef)).get('writeClaim') as {
        claimId?: string;
      } | null;
      if (claim?.claimId !== claimId) return;
      transaction.update(topicRef, {
        writeClaim: null,
        pendingNoteIds: [],
        docState: topic.version === 0 ? 'empty' : 'current',
      });
    });
    return result('current', topic, 0, 0);
  }

  const provider = pickTopicProvider(readApiKey());
  if (!provider) throw new Error('noModelKey');
  const hasDay = await reserveTopicWrite(firestore, uid, now);
  const held = hasDay
    ? await reserveAiCall(firestore, uid, now, 'full').catch(
        async (error: unknown) => {
          await releaseTopicWrite(firestore, uid, now).catch(() =>
            logger.error('helm.topic.releaseWriteFailed'),
          );
          throw error;
        },
      )
    : 'dailyLimit';
  if (held) {
    if (hasDay) await releaseTopicWrite(firestore, uid, now);
    await release(firestore, topicRef, claimId, 'behind');
    return held === 'recentLimit'
      ? result('busy', topic, 0, undefined, 'soon')
      : result('limited', topic, 0, undefined, 'tomorrow');
  }

  const captureTimes = await readCaptureTimes(firestore, base, notes).catch(
    async (error: unknown) => {
      await releaseTopicWrite(firestore, uid, now).catch(() =>
        logger.error('helm.topic.releaseWriteFailed'),
      );
      throw error;
    },
  );
  const fresh = new Map<string, TopicSource>(
    notes.map((note) => [
      note.id,
      toNoteSource(
        note,
        note.sourceCaptureId
          ? (captureTimes.get(note.sourceCaptureId) ?? null)
          : null,
      ),
    ]),
  );
  const known = new Map<string, TopicSource>([
    ...sections.flatMap((section) =>
      section.sources.flatMap((source): [string, TopicSource][] => {
        const id = sourceNoteId(source);
        return id ? [[id, source]] : [];
      }),
    ),
    ...fresh,
  ]);
  const cited = new Set(
    sections.flatMap((section) => section.sources.map(sourceNoteId)),
  );
  const reply = await askModel(firestore, provider, 'topicWrite', {
    system: TOPIC_WRITE_PROMPT,
    message: buildWriteMessage({
      name,
      sections,
      notes,
      changedIds: notes.flatMap((note) =>
        cited.has(note.id) ? [note.id] : [],
      ),
      removedIds: [...gone],
    }),
    terminalTool: SUBMIT_TOPIC_TOOL,
  });
  const read = readChanges(reply);
  if (!read) throw new Error('noChanges');
  const applied = applyTopicChanges({
    sections,
    changes: read.changes,
    known,
    gone,
    newId: randomUUID,
    options: {
      mode: 'write',
      changedIds: new Set(
        notes.flatMap((note) => (cited.has(note.id) ? [note.id] : [])),
      ),
    },
  });
  logger.info('helm.topic.applied', {
    applied: applied.applied.length,
    refused: applied.refusals.map((refusal) => refusal.code),
  });
  if (applied.applied.length === 0) throw new Error('allRefused');
  const finalSections = dropGoneSources(applied.sections, gone).sections;

  const reason = pickReason(topic.version, applied.applied);
  const taken = notes.map((note) => note.id);
  const executionRef = firestore.collection(`${base}/executions`).doc();
  const seal = (fields: Record<string, unknown>) => sealForHelm(key, fields);
  const committed = await firestore.runTransaction(async (transaction) => {
    const [snapshot, existingVersions] = await Promise.all([
      transaction.get(topicRef),
      readVersionNumbers(transaction, topicRef),
    ]);
    const data = snapshot.data();
    const current = data ? toTopicDoc(data) : null;
    if (
      !current ||
      current.version !== topic.version ||
      current.writeClaim?.claimId !== claimId
    ) {
      return null;
    }
    const pendingNoteIds = current.pendingNoteIds.filter(
      (id) => !taken.includes(id),
    );
    const version = writeTopicVersionIn(transaction, {
      topicRef,
      currentVersion: current.version,
      existingVersions,
      currentWords: openWords(key, current.sealed),
      sections: finalSections,
      reason,
      noteIds: taken,
      sourceCaptureId: null,
      executionId: executionRef.id,
      changeSummary: buildChangeSummary(read.summary, reason, taken.length),
      requestQuote: null,
      parentName: null,
      docState: pendingNoteIds.length > 0 ? 'behind' : 'current',
      pendingNoteIds,
      now,
      seal,
    });
    transaction.set(
      executionRef,
      buildWriteExecution(now, seal, describeWrite(name, reason, taken.length)),
    );
    return { version, waiting: pendingNoteIds.length };
  });
  if (!committed) throw new Error('topicMoved');

  if (topic.parentId) {
    await refreshOverview(
      firestore,
      base,
      key,
      provider,
      topic.parentId,
      topicId,
      committed.version,
    ).catch((error: unknown) =>
      logger.warn('helm.topic.overviewFailed', {
        cause: error instanceof Error ? error.message : 'error',
      }),
    );
  }
  return {
    status: 'written',
    version: committed.version,
    broughtIn: taken.length,
    waiting: committed.waiting,
    retry: null,
  };
}

async function refreshOverview(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  provider: ModelProvider,
  parentId: string,
  childId: string,
  childVersion: number,
) {
  const parentRef = firestore.doc(`${base}/topics/${parentId}`);
  const parentData = (await parentRef.get()).data();
  if (!parentData) return;
  const parent = toTopicDoc(parentData);
  if (parent.overviewOf[childId] === childVersion) return;
  const children = (
    await firestore
      .collection(`${base}/topics`)
      .where('parentId', '==', parentId)
      .limit(MAX_CHILDREN_READ)
      .get()
  ).docs.flatMap((doc) => {
    try {
      const child = toTopicDoc(doc.data());
      const words = openWords(key, child.sealed);
      const childSections = toSections(words);
      return typeof words.name === 'string' && child.version > 0
        ? [
            {
              id: doc.id,
              version: child.version,
              name: words.name,
              headings: childSections.flatMap((section) =>
                section.heading ? [section.heading] : [],
              ),
              first: (childSections[0]?.markdown ?? '').slice(0, OUTLINE_CHARS),
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
  if (children.length === 0) return;
  const parentWords = openWords(key, parent.sealed);
  const reply = await askModel(firestore, provider, 'topicOverview', {
    system: TOPIC_OVERVIEW_PROMPT,
    message: buildOverviewMessage({
      name: typeof parentWords.name === 'string' ? parentWords.name : '',
      children: children.map(({ name, headings, first }) => ({
        name,
        headings,
        first,
      })),
    }),
    terminalTool: SUBMIT_OVERVIEW_TOOL,
    limits: OVERVIEW_LIMITS,
  });
  const overview =
    typeof (reply as { overview?: unknown } | null)?.overview === 'string'
      ? (reply as { overview: string }).overview
          .trim()
          .slice(0, MAX_OVERVIEW_CHARS)
      : '';
  if (overview === '') return;
  await firestore.runTransaction(async (transaction) => {
    const data = (await transaction.get(parentRef)).data();
    if (!data) return;
    transaction.update(parentRef, {
      sealed: sealForHelm(key, {
        ...openWords(key, toTopicDoc(data).sealed),
        overview,
      }),
      overviewOf: Object.fromEntries(
        children.map((child) => [child.id, child.version]),
      ),
    });
  });
}

const readInput = (data: unknown) => {
  const { topicId } = (data ?? {}) as { topicId?: unknown };
  if (typeof topicId !== 'string' || !ID_RE.test(topicId)) {
    throw new HttpsError('invalid-argument', 'This topic could not be read.');
  }
  return topicId;
};

export const writeHelmTopic = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    minInstances: 0,
    timeoutSeconds: 90,
    enforceAppCheck: true,
    secrets: [HELM_MASTER_KEYS, ANTHROPIC_API_KEY],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<WriteTopicResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
    }
    const topicId = readInput(request.data);
    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();
    const base = `apps/helm/users/${uid}`;
    const topicRef = firestore.doc(`${base}/topics/${topicId}`);
    const now = Date.now();
    const claimed = await claimTopic(firestore, base, topicRef, topicId, now);
    if (claimed.kind === 'settled') return claimed.response;
    const { claimId, topic } = claimed;
    try {
      const key = await unwrapHelmKey(firestore, keyring, uid);
      return await writeClaimed({
        firestore,
        uid,
        base,
        topicId,
        topicRef,
        claimId,
        topic,
        key,
        now,
      });
    } catch (error) {
      logger.warn('helm.topic.failed', {
        cause: error instanceof Error ? error.message : 'error',
      });
      await release(firestore, topicRef, claimId, 'failed').catch(() =>
        logger.error('helm.topic.releaseFailed'),
      );
      return result('failed', topic);
    }
  },
);
