import { collection, doc, updateDoc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { generateUuid } from '@/utils';
import { HELM_COPY, NOTE_BODY_MAX } from '@apps/helm/constants';
import type { LearnSlot } from '@apps/helm/engine/learnLater';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { sealJson } from '@apps/helm/security';
import { saveOverviewAsNote } from '@apps/helm/store/actions/noteActions';
import type {
  EffectRef,
  Execution,
  ExecutionEffect,
  ExecutionSealed,
  HelmEncryption,
  LearnOffer,
  OpenResearch,
} from '@apps/helm/types';
import { pickFittingTopic } from '@apps/helm/utils/noteSearch';
import { toSavedNoteTitle } from '@apps/helm/utils/savedAnswer';

import { cancelResearch as stopResearch } from '@apps/helm/store/actions/researchActions';

/** The tap that stops a look in progress, kept here so the map names one writer for every tap on research. */
export const cancelResearch = stopResearch;

const MAX_OFFERS = 10;

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);
const researchRef = (uid: string, id: string) =>
  doc(collection(userOf(uid), 'research'), id);

type Fields = Record<string, unknown>;

/** A tap that left a line in Activity: the execution's id, so Undo can take it back, and the write, which is not awaited so a tap works offline. */
export interface LearnTap {
  executionId: string;
  written: Promise<void>;
}

const toOffer = (
  outcome: LearnOffer['outcome'],
  slot: LearnSlot | null,
): LearnOffer => ({
  at: Date.now(),
  dayKind: slot?.dayKind ?? null,
  gapMinutes: slot?.gapMinutes ?? null,
  afterBusyDay: null,
  outcome,
});

const withOffer = (item: OpenResearch, offer: LearnOffer) =>
  [...item.offers, offer].slice(-MAX_OFFERS);

const toExecution = async (
  encryption: HelmEncryption,
  input: {
    summary: string;
    refs: EffectRef[];
    effects: ExecutionEffect[];
    now: number;
  },
): Promise<Execution> => ({
  captureId: null,
  actor: 'person',
  via: null,
  category: 'plan',
  autonomyLevel: 1,
  state: 'succeeded',
  effectRefs: input.refs,
  linkedWhoIds: [],
  linkedPlaceIds: [],
  undoesExecutionId: null,
  undoneByExecutionId: null,
  undoneDocIds: null,
  partUndoIds: null,
  questionRef: null,
  errorCode: null,
  privacy: 'ordinary',
  createdAt: input.now,
  decidedAt: input.now,
  finishedAt: input.now,
  sealed: await sealJson<ExecutionSealed>(
    {
      summary: input.summary,
      said: null,
      commands: [],
      effects: input.effects,
      undoReport: null,
      spoken: null,
      heldSpoken: null,
      goneIds: null,
      undoReason: null,
      lines: null,
      abilityOffer: null,
      awayZoneOffer: null,
    },
    encryption,
  ),
});

const previousOf = (item: OpenResearch, fields: Fields): Fields =>
  Object.fromEntries(
    Object.keys(fields).map((key) => [
      key,
      (item as unknown as Fields)[key] ?? null,
    ]),
  );

/** Writes the item's change and an execution holding it in one batch, so Undo takes it back through `planUndo`. */
async function writeWithExecution(
  uid: string,
  item: OpenResearch,
  fields: Fields,
  summary: string,
): Promise<LearnTap> {
  const encryption = await getHelmEncryption(uid);
  const now = Date.now();
  const executionRef = doc(collection(userOf(uid), 'executions'));
  const title = item.subject;
  const execution = await toExecution(encryption, {
    summary,
    refs: [{ op: 'update', collection: 'research', docId: item.id }],
    effects: [
      {
        written: { ...fields, 'sealed.title': title },
        previous: { ...previousOf(item, fields), 'sealed.title': title },
      },
    ],
    now,
  });
  const batch = writeBatch(db);
  batch.update(researchRef(uid, item.id), { ...fields, lastEditedAt: now });
  batch.set(executionRef, execution);
  return { executionId: executionRef.id, written: batch.commit() };
}

/** Today showed the card: marks the item offered today so every device offers the same one. */
export const markLearnOffered = (
  uid: string,
  item: OpenResearch,
  dayKey: string,
) =>
  updateDoc(researchRef(uid, item.id), {
    status: 'offered',
    offeredOn: dayKey,
    lastEditedAt: Date.now(),
  });

/** "Not now": the item goes back on the list one Not now further, and Today leaves it alone for the day. */
export const notNowLearn = (
  uid: string,
  item: OpenResearch,
  slot: LearnSlot | null,
) =>
  updateDoc(researchRef(uid, item.id), {
    ...(item.status === 'ready' ? {} : { status: 'ready' }),
    offeredOn: null,
    declineReason: 'timing',
    notNowStreak: item.notNowStreak + 1,
    offers: withOffer(item, toOffer('notNow', slot)),
    lastEditedAt: Date.now(),
  });

/** "Show me": a yes from the person, which clears the Not now streak and teaches which evenings work. */
export const showLearn = (
  uid: string,
  item: OpenResearch,
  slot: LearnSlot | null,
) =>
  updateDoc(researchRef(uid, item.id), {
    status: 'offered',
    notNowStreak: 0,
    offers: withOffer(item, toOffer('yes', slot)),
    lastEditedAt: Date.now(),
  });

/** "Keep it" after three Not nows: it stays, and the count starts again. */
export const keepStillLearn = (uid: string, item: OpenResearch) =>
  updateDoc(researchRef(uid, item.id), {
    status: 'ready',
    offeredOn: null,
    notNowStreak: 0,
    lastEditedAt: Date.now(),
  });

/** Takes the item off the list (never deleted), remembering the person lost interest so it is not suggested again. */
export const removeLearn = (uid: string, item: OpenResearch) =>
  writeWithExecution(
    uid,
    item,
    {
      status: 'dismissed',
      declineReason: 'lostInterest',
      removedAt: Date.now(),
    },
    HELM_COPY.learnRemoved(item.subject),
  );

/** "Done with it": the item leaves the list as learned. */
export const doneLearn = (uid: string, item: OpenResearch) =>
  writeWithExecution(
    uid,
    item,
    { status: 'done' },
    HELM_COPY.learnDoneLine(item.subject),
  );

const toNoteBody = (item: OpenResearch) => {
  const overview = item.overview;
  const isSteps = overview?.form === 'steps';
  const lines = [
    overview?.summary ?? '',
    ...(overview?.sections ?? []).flatMap((section) => [
      section.heading,
      ...section.points.map((point, index) =>
        isSteps ? `${index + 1}. ${point}` : `- ${point}`,
      ),
    ]),
    ...(overview?.comparison
      ? [overview.comparison.columns, ...overview.comparison.rows].map((row) =>
          row.join(' | '),
        )
      : []),
    item.isWithoutWeb ? HELM_COPY.learnCautionGeneral : HELM_COPY.learnCaution,
  ];
  return lines
    .filter((line) => line.trim() !== '')
    .join('\n\n')
    .slice(0, NOTE_BODY_MAX);
};

export type KeepLearnResult =
  | ({ kind: 'saved'; topicName: string | null } & LearnTap)
  | { kind: 'empty' | 'full' };

/** "Save to my knowledge": the overview as a note (under the topic it plainly fits, else loose) and the item marked done, in one batch with one execution so Undo takes back both. Videos are not copied. */
export async function keepLearn(
  uid: string,
  item: OpenResearch,
): Promise<KeepLearnResult> {
  const encryption = await getHelmEncryption(uid);
  const { notes, topics } = store.getState().helm;
  const title = toSavedNoteTitle(item.subject);
  const body = toNoteBody(item);
  const readableTopics = topics.items.filter((topic) => !topic.isUnreadable);
  const topicId = pickFittingTopic(
    `${title} ${body}`,
    notes.items.filter((note) => !note.isUnreadable),
    readableTopics,
  );
  const topic = readableTopics.find((entry) => entry.id === topicId) ?? null;
  const noteId = generateUuid();
  const executionRef = doc(collection(userOf(uid), 'executions'));
  const now = Date.now();
  const fields: Fields = { status: 'done', resultNoteId: noteId };
  const topicState =
    topic && (topic.docState === 'writing' || topic.docState === 'failed')
      ? topic.docState
      : 'behind';
  const refs: EffectRef[] = [
    { op: 'update', collection: 'research', docId: item.id },
    { op: 'create', collection: 'notes', docId: noteId },
    ...(topic
      ? [{ op: 'update', collection: 'topics', docId: topic.id } as EffectRef]
      : []),
  ];
  const execution = await toExecution(encryption, {
    summary: HELM_COPY.learnKept,
    refs,
    effects: [
      {
        written: { ...fields, 'sealed.title': item.subject },
        previous: {
          ...previousOf(item, fields),
          'sealed.title': item.subject,
        },
      },
      { written: { 'sealed.title': title }, previous: null },
      ...(topic
        ? [
            {
              written: {
                docState: topicState,
                pendingNoteIds: [...topic.pendingNoteIds, noteId],
                'sealed.title': topic.name,
              },
              previous: {
                docState: topic.docState,
                pendingNoteIds: topic.pendingNoteIds,
                'sealed.title': topic.name,
              },
            },
          ]
        : []),
    ],
    now,
  });
  const saved = await saveOverviewAsNote(
    uid,
    encryption,
    {
      id: noteId,
      title,
      body,
      topic,
      noteCount: notes.items.length,
      sourceCaptureId: item.captureId,
      executionId: executionRef.id,
    },
    (batch) => {
      batch.update(researchRef(uid, item.id), { ...fields, lastEditedAt: now });
      batch.set(executionRef, execution);
    },
  );
  return saved.kind === 'saved'
    ? {
        kind: 'saved',
        topicName: topic?.name ?? null,
        executionId: executionRef.id,
        written: saved.written,
      }
    : saved;
}
