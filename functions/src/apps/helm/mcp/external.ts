import { createHash, randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  FieldValue,
  getFirestore,
  type Firestore,
} from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { isGateOpenForUid } from '../../../gates/assertGateOpen.js';
import {
  createMcpHttpHandler,
  type McpRequestContext,
} from '../../../mcp/serveMcp.js';
import { WORKOS_API_KEY, WORKOS_AUTHKIT_DOMAIN } from '../../../mcp/workos.js';
import { HELM_MASTER_KEYS } from '../getHelmKey.js';
import {
  openForHelm,
  sealForHelm,
  unwrapHelmKey,
  type HelmKey,
} from '../helmKey.js';
import { readAssistantName } from '../assistantName.js';
import { readDates, readIsUrgent } from '../dateReading.js';
import { DEFAULT_ASSISTANT_NAME } from '../nomos/commands.js';
import { AUTOMATIC_LEVEL } from '../nomos/policy.js';
import { connectorLabel, toKnownZone } from '../syncedCopies.js';
import type { ConnectionGrant } from '../../../vendor/connectionsContract.js';
import { createAliasBook, createSealedAliasBook } from '../nomos/aliases.js';
import { readMadeTitles } from '../nomos/buildContext.js';
import {
  ANTHROPIC_API_KEY,
  loadKeyringOrFail,
  readLiveGrants,
  readSiteGrants,
  runHelmSort,
  type CaptureDoc,
  type SortResult,
} from '../sortHelmCapture.js';
import type { McpReadScope } from '../../../mcp/shapes.js';
import type { SealedPayload } from '../../../appKeys/seal.js';
import { openTopicRecord } from '../noteStore.js';
import { openLiveTopic } from '../topicVersionStore.js';
import { TOPICS_LIMIT } from '../topicLimits.js';
import { createOptionMatcher } from '../../../vendor/optionMatchUtils.js';
import { buildHelmTools } from './buildTools.js';
import {
  SAVE_ABOUT_CAP,
  SAVE_LEARNED_CAP,
  SAVE_NEW_TOPIC_CAP,
  SAVE_TITLE_CAP,
  describeSave,
  planSaveToHelm,
} from './saveToHelm.js';
import {
  READ_SCOPE_TOOLS,
  accessForConnector,
  sourcesBriefFor,
  type ConnectedSource,
} from './sourcesBrief.js';
import { offeredHelmTools, registerHelmTools } from './server.js';

const RESOURCE = 'https://apps.moondreams.dev/mcp/helm';
const GATE_APP_ID = 'helm';
const GATE_ID = 'helm-assistants';
const TELL_MAX_CHARS = 4_000;
const ASK_MAX_CHARS = 2_000;

const OFF_TEXT =
  "Helm's assistant connections are switched off for this account right now.";
const NO_KEY_TEXT =
  'Helm needs to be opened once on a phone or computer before an assistant can read it.';

const text = (value: string) => ({
  content: [{ type: 'text' as const, text: value }],
});

/** The one tool a closed gate or a missing key leaves, so the client reads why instead of seeing an empty list. */
const refuseAll = (message: string) => {
  const server = new McpServer({ name: 'helm', version: '1.0.0' });
  server.registerTool(
    'helm_unavailable',
    {
      description: `${message} Nothing in Helm can be read or changed through this connection until that changes.`,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => text(message),
  );
  return server;
};

const openWords = (key: HelmKey, sealed: unknown) => {
  try {
    return openForHelm(key, sealed as SealedPayload);
  } catch {
    return null;
  }
};

const readLabel = (words: Record<string, unknown> | null) => {
  const label = words?.title ?? words?.name ?? words?.statement;
  return typeof label === 'string' && label !== '' ? label : null;
};

const SOURCE_COLLECTIONS: Record<string, string> = {
  task: 'tasks',
  project: 'projects',
  who: 'who',
  place: 'places',
  procedure: 'procedures',
  topic: 'topics',
  fact: 'facts',
};

interface StoredSource {
  kind?: string;
  id?: string;
  title?: string | null;
}

/** An answer's sources by the words the person knows them by; one that is gone or will not open is left out. */
const readSourceTitles = (
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  sources: StoredSource[],
) =>
  Promise.all(
    sources.map(async (source) => {
      if (typeof source.title === 'string' && source.title !== '') {
        return source.title;
      }
      const collection = source.kind ? SOURCE_COLLECTIONS[source.kind] : null;
      if (!collection || typeof source.id !== 'string') return null;
      const snapshot = await firestore
        .doc(`apps/helm/users/${uid}/${collection}/${source.id}`)
        .get();
      const data = snapshot.data() as { sealed?: unknown } | undefined;
      return data?.sealed ? readLabel(openWords(key, data.sealed)) : null;
    }),
  ).then((titles) => [
    ...new Set(titles.flatMap((title) => (title ? [title] : []))),
  ]);

interface StoredAnswer {
  fromRecords?: string | null;
  sources?: StoredSource[];
  general?: string | null;
}

interface StoredExecution {
  effectRefs?: unknown;
  sealed?: unknown;
}

const WAITING_TEXT = 'It is waiting in Helm.';

const FILED_TEXT = 'Helm filed it.';

const STATUS_TEXT: Record<Exclude<SortResult['status'], 'sorted'>, string> = {
  received: `Helm is still reading it. ${WAITING_TEXT}`,
  needsYou: `Helm needs the person to decide something about it, so it is waiting in Helm.`,
  failed: `Helm could not read it just now. ${WAITING_TEXT}`,
};

/** What a filed turn came to, as compact text: Helm's words, the records it made by name, and any answer with its sources. */
async function describeTurn({
  firestore,
  uid,
  key,
  captureId,
  result,
}: {
  firestore: Firestore;
  uid: string;
  key: HelmKey;
  captureId: string;
  result: SortResult;
}) {
  if (result.status !== 'sorted') return STATUS_TEXT[result.status];
  const base = `apps/helm/users/${uid}`;
  const capture = (
    await firestore.doc(`${base}/captures/${captureId}`).get()
  ).data() as CaptureDoc | undefined;
  const opened = capture ? openWords(key, capture.sealed) : null;
  const answer = (opened?.answer ?? null) as StoredAnswer | null;
  const executions = await Promise.all(
    (capture?.executionIds ?? []).map(
      async (id) =>
        (await firestore.doc(`${base}/executions/${id}`).get()).data() as
          StoredExecution | undefined,
    ),
  );
  const lines = executions.flatMap((execution) => {
    const words = execution?.sealed ? openWords(key, execution.sealed) : null;
    if (!words) return [];
    const line = [words.said, words.summary].find(
      (entry): entry is string => typeof entry === 'string' && entry !== '',
    );
    const made = readMadeTitles(execution?.effectRefs, words);
    return [
      ...(line ? [line] : []),
      ...(made.length > 0 ? [`Made: ${made.join('; ')}`] : []),
    ];
  });
  const titles = answer?.sources
    ? await readSourceTitles(firestore, uid, key, answer.sources)
    : [];
  return (
    [
      ...lines,
      ...(answer?.fromRecords ? [answer.fromRecords] : []),
      ...(titles.length > 0 ? [`From: ${titles.join('; ')}`] : []),
      ...(answer?.general ? [`Not from your records:\n${answer.general}`] : []),
    ].join('\n\n') || FILED_TEXT
  );
}

const ALREADY_EXISTS = 6;
// Hosting cuts a function off at 60 seconds, so a slow sort answers "still reading" and the device finishes it.
const SORT_ANSWER_MS = 45 * 1000;
const STILL_READING: SortResult = {
  status: 'received',
  executionId: null,
  releasedIds: [],
  hasAnswer: false,
  spoken: null,
  abilityOffer: null,
};
const RETRY_WINDOW_MS = 2 * 60 * 1000;
const ALREADY_FILED_TEXT =
  "Helm already has these words from a moment ago, so they were not filed twice. What it did is in Helm's Activity.";

/** The same words from the same assistant within two minutes are one turn, so a retried call never files them twice. */
const retryKeyFor = (ctx: McpRequestContext, words: string, now: number) =>
  `mcp_${createHash('sha256')
    .update(
      [
        ctx.uid,
        ctx.clientKey,
        [...ctx.readScopes].sort().join(','),
        words,
        Math.floor(now / RETRY_WINDOW_MS),
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 28)}`;

/** The fields every outside capture carries; the caller adds its status, executions and sealed words. */
const outsideCaptureFields = (ctx: McpRequestContext, createdAt: number) => ({
  inputMode: 'typed',
  sttProvider: null,
  interruptedCaptureId: null,
  answersQuestion: null,
  ttsProvider: null,
  arrivedVia: 'direct',
  medium: 'mcp',
  via: ctx.clientName,
  outsideReadScopes: ctx.readScopes,
  sessionId: randomUUID(),
  turnIndex: 0,
  route: null,
  heldReason: null,
  claimId: null,
  claimedAt: null,
  attempts: 0,
  lastErrorCode: null,
  questionState: {},
  turnLeadId: null,
  joinedCaptureIds: [],
  attachmentIds: [],
  // Home never shows an outside turn, so it is filed seen and stays out of home's unseen window.
  seenAt: createdAt,
  quotedSourceKeys: [],
  dismissedAt: null,
  answerSavedNoteId: null,
  whoIds: [],
  placeIds: [],
  planDayKey: null,
  aimsDayKey: null,
  morningDayKey: null,
  createdAt,
  screen: null,
});

const readingOf = (words: string, now: number, timeZone: string) => ({
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: readIsUrgent(words),
  dates: readDates(words, { now, timeZone }),
  addressedAs: null,
});

/** Writes a turn the way the device does (same fields, the words sealed under the person's key) and has Helm sort it, under the same limits as a typed one. */
async function fileTurn({
  ctx,
  key,
  words,
}: {
  ctx: McpRequestContext;
  key: HelmKey;
  words: string;
}) {
  const firestore = getFirestore();
  const createdAt = Date.now();
  const profile = await firestore.doc(`apps/helm/users/${ctx.uid}`).get();
  const timeZone = toKnownZone(
    (profile.data()?.timeZone as string | undefined) ?? 'UTC',
  );
  const reference = firestore
    .collection(`apps/helm/users/${ctx.uid}/captures`)
    .doc(retryKeyFor(ctx, words, createdAt));
  const isNew = await reference
    .create({
      ...outsideCaptureFields(ctx, createdAt),
      status: 'received',
      executionIds: [],
      sortedAt: null,
      sealed: sealForHelm(key, {
        text: words,
        reading: readingOf(words, createdAt, timeZone),
        answer: null,
        questionAnswer: null,
      }),
    })
    .then(
      () => true,
      (error: unknown) => {
        if ((error as { code?: unknown }).code === ALREADY_EXISTS) return false;
        throw error;
      },
    );
  if (!isNew) return ALREADY_FILED_TEXT;
  const result = await Promise.race([
    runHelmSort({
      uid: ctx.uid,
      captureId: reference.id,
      requestKey: randomUUID(),
      mode: 'full',
      noteIds: [],
    }),
    new Promise<SortResult>((resolve) =>
      setTimeout(() => resolve(STILL_READING), SORT_ANSWER_MS),
    ),
  ]).catch((): SortResult => ({
    status: 'failed',
    executionId: null,
    releasedIds: [],
    hasAnswer: false,
    spoken: null,
    abilityOffer: null,
  }));
  return describeTurn({
    firestore,
    uid: ctx.uid,
    key,
    captureId: reference.id,
    result,
  }).catch(() => FILED_TEXT);
}

const tellShape = {
  text: z
    .string()
    .min(1)
    .max(TELL_MAX_CHARS)
    .describe(
      'What the person wants Helm to remember or do, in their own words, such as "Remind me to call Dana on Friday" or "Mum is allergic to penicillin".',
    ),
};

const saveShape = {
  title: z
    .string()
    .min(1)
    .max(SAVE_TITLE_CAP)
    .describe(
      'A short name for what was learned, such as "Timing belt schedule".',
    ),
  learned: z
    .string()
    .min(1)
    .max(SAVE_LEARNED_CAP)
    .describe(
      'What was learned, written out in full as Markdown: the facts, numbers and conclusions themselves. Never "remember this" or a pointer to the chat.',
    ),
  about: z
    .string()
    .max(SAVE_ABOUT_CAP)
    .nullish()
    .describe(
      'What it is about in the person\'s life, such as "my 2019 Subaru Outback".',
    ),
  topic: z
    .string()
    .nullish()
    .describe(
      'The topic that fits, exactly as list_topics or get_topic returned it.',
    ),
  newTopic: z
    .string()
    .max(SAVE_NEW_TOPIC_CAP)
    .nullish()
    .describe('A name for a new topic, used only when no listed topic fits.'),
  sources: z
    .array(
      z.object({
        title: z.string().max(120),
        url: z.string().max(2_000),
      }),
    )
    .max(20)
    .nullish()
    .describe(
      'At most 5 links that back it up, never every page read. Only https links are kept.',
    ),
};

const NOT_FOUND_TOPIC_TEXT =
  'That topic was not found in list_topics, so it was treated as no topic.';

const topicNameMatcher = createOptionMatcher<{ id: string; name: string }>({
  names: (topic) => [topic.name],
});

/** The person's topic an assistant's new topic name already means, so a skipped list_topics or a different casing never makes a second one. */
async function sameNamedTopic(key: HelmKey, base: string, name: string) {
  const docs = (
    await getFirestore().collection(`${base}/topics`).limit(TOPICS_LIMIT).get()
  ).docs;
  const topics = docs.flatMap((doc) => {
    const topic = openLiveTopic(key, doc.id, doc.data());
    return topic ? [{ id: doc.id, name: topic.name }] : [];
  });
  return topicNameMatcher.match(name, topics)?.id ?? null;
}

/** Saves what an outside assistant learned as a note (and a topic when asked) with no model call, in one transaction, recorded as one execution so Undo in Helm takes it back like a file import. */
async function saveTurn({
  ctx,
  key,
  name,
  topicIdOf,
  input,
}: {
  ctx: McpRequestContext;
  key: HelmKey;
  name: string;
  topicIdOf: (alias: string) => string | null;
  input: z.infer<z.ZodObject<typeof saveShape>>;
}) {
  const firestore = getFirestore();
  const base = `apps/helm/users/${ctx.uid}`;
  const now = Date.now();
  const words = `${input.title}\n\n${input.learned}`;
  const seal = (fields: Record<string, unknown>) => sealForHelm(key, fields);
  const profile = await firestore.doc(base).get();
  const timeZone = toKnownZone(
    (profile.data()?.timeZone as string | undefined) ?? 'UTC',
  );
  const captureRef = firestore
    .collection(`${base}/captures`)
    .doc(retryKeyFor(ctx, words, now));
  const executionRef = firestore.collection(`${base}/executions`).doc();
  const namedId = input.topic ? topicIdOf(input.topic) : null;
  const topicId =
    namedId ??
    (input.newTopic?.trim()
      ? await sameNamedTopic(key, base, input.newTopic)
      : null);
  const outcome = await firestore
    .runTransaction(async (transaction) => {
      const [topicSnapshot, notes, topics] = await Promise.all([
        topicId
          ? transaction.get(firestore.doc(`${base}/topics/${topicId}`))
          : null,
        transaction.get(firestore.collection(`${base}/notes`).count()),
        transaction.get(firestore.collection(`${base}/topics`).count()),
      ]);
      const opened =
        topicId && topicSnapshot?.exists
          ? openTopicRecord(key, topicId, topicSnapshot.data() ?? {})
          : null;
      const plan = planSaveToHelm({
        title: input.title,
        learned: input.learned,
        about: input.about ?? null,
        sources: input.sources ?? [],
        topic:
          topicId && opened
            ? {
                id: topicId,
                state: {
                  name: opened.name,
                  path: opened.name,
                  docState: opened.docState,
                  pendingNoteIds: opened.pendingNoteIds,
                },
              }
            : null,
        newTopic: opened ? null : (input.newTopic ?? null),
        noteCount: notes.data().count,
        topicCount: topics.data().count,
        via: ctx.clientName,
        captureId: captureRef.id,
        executionId: executionRef.id,
        now,
        newId: () => randomUUID(),
        seal,
      });
      if (plan.kind === 'full') return plan;
      transaction.create(captureRef, {
        ...outsideCaptureFields(ctx, now),
        status: 'sorted',
        executionIds: [executionRef.id],
        sortedAt: now,
        sealed: seal({
          text: words,
          reading: readingOf(words, now, timeZone),
          answer: null,
          questionAnswer: null,
        }),
      });
      transaction.create(
        firestore.doc(`${base}/notes/${plan.noteId}`),
        plan.noteData,
      );
      if (plan.topic) {
        const topicRef = firestore.doc(`${base}/topics/${plan.topic.id}`);
        transaction.create(topicRef, plan.topic.data);
        transaction.create(
          topicRef.collection('versions').doc('1'),
          plan.topic.version,
        );
      }
      if (plan.filing) {
        transaction.update(firestore.doc(`${base}/topics/${plan.filing.id}`), {
          docState: plan.filing.docState,
          pendingNoteIds: FieldValue.arrayUnion(plan.filing.addPendingId),
        });
      }
      transaction.create(executionRef, {
        via: ctx.clientName,
        captureId: captureRef.id,
        actor: 'nomos',
        category: 'organize',
        autonomyLevel: AUTOMATIC_LEVEL,
        state: 'succeeded',
        effectRefs: plan.effectRefs,
        linkedWhoIds: [],
        linkedPlaceIds: [],
        undoesExecutionId: null,
        undoneByExecutionId: null,
        undoneDocIds: null,
        partUndoIds: null,
        questionRef: null,
        errorCode: null,
        createdAt: now,
        decidedAt: now,
        finishedAt: now,
        sealed: seal({
          summary: plan.summary,
          said: null,
          commands: [],
          effects: plan.effects,
          lines: plan.lines,
          undoReport: null,
          goneIds: null,
          undoReason: null,
          heldSpoken: null,
          spoken: null,
        }),
      });
      return plan;
    })
    .catch((error: unknown) => {
      if ((error as { code?: unknown }).code === ALREADY_EXISTS) return null;
      throw error;
    });
  if (!outcome) return ALREADY_FILED_TEXT;
  if (outcome.kind === 'full') {
    return `${outcome.line} Nothing was saved; the person can make room in Helm first.`;
  }
  return [
    describeSave(outcome, name),
    ...(input.topic && outcome.where !== 'topic' ? [NOT_FOUND_TOPIC_TEXT] : []),
  ].join(' ');
}

const askShape = {
  question: z
    .string()
    .min(1)
    .max(ASK_MAX_CHARS)
    .describe(
      'A question about the person\'s own life, as they would ask it, such as "When is Grandpa\'s birthday?" or "What did I decide about the kitchen?".',
    ),
};

/** Each source the person has connected to Helm, once, with the categories they switched on, in the manifest's own words. */
const readConnectedSources = async (
  firestore: Firestore,
  uid: string,
): Promise<ConnectedSource[]> => {
  const snapshot = await firestore
    .collection(`connections/${uid}/grants`)
    .where('readerAppId', '==', 'helm')
    .get();
  const [{ SOURCE_ADAPTERS }, { isConnectorGateOpen }] = await Promise.all([
    import('../../../connections/registry.js'),
    import('../../../connections/liveRouter.js'),
  ]);
  const live = snapshot.docs
    .filter((doc) => doc.get('status') !== 'ended')
    .map((doc) => doc.data() as ConnectionGrant);
  const isOpen = await Promise.all(
    live.map((grant) => isConnectorGateOpen(uid, 'helm', grant.connectorId)),
  );
  const grants = live
    .filter((_, index) => isOpen[index])
    .sort((a, b) => (a.connectorId < b.connectorId ? -1 : 1));
  const byConnector = grants.reduce((sources, grant) => {
    const manifest = SOURCE_ADAPTERS[grant.connectorId]?.manifest;
    if (!manifest) return sources;
    const onIds = new Set([
      ...(sources.get(grant.connectorId)?.onIds ?? []),
      ...Object.entries(grant.categories)
        .filter(([, entry]) => entry.isOn)
        .map(([id]) => id),
    ]);
    return new Map(sources).set(grant.connectorId, { manifest, onIds });
  }, new Map<string, { manifest: (typeof SOURCE_ADAPTERS)[string]['manifest']; onIds: Set<string> }>());
  return [...byConnector.entries()].map(
    ([connectorId, { manifest, onIds }]) => ({
      name: connectorLabel(connectorId),
      access: accessForConnector(connectorId),
      about: manifest.about,
      categories: manifest.categories
        .filter((category) => onIds.has(category.id))
        .map(({ label, meaning }) => ({ label, meaning })),
    }),
  );
};

/** What an assistant is told when it connects: the person calls their Helm assistant by the name they chose, so that name routes here. */
const instructionsFor = (
  name: string,
  canWrite: boolean,
  sources: ConnectedSource[],
  access: {
    clientName: string;
    readScopes: McpReadScope[];
    toolNames: string[];
  },
) =>
  [
    `This connection is ${name}, the person's own assistant in their Helm app (the name is theirs, and they may change it).`,
    canWrite
      ? `When they say "tell ${name}", "ask ${name}", "have ${name}" or mention Helm, use these tools: tell_helm passes on something for ${name} to file or do (a task, a date, anything to do), ask_helm asks ${name} a question, save_to_helm saves what they learned or researched in this chat, and the search tools look things up directly.`
      : `When they say "ask ${name}" or mention Helm, look things up with the search tools. This connection can't add anything, since the person turned that off in Helm; when they ask ${name} to add or change something, say so.`,
    `Whenever the conversation touches the person's own life (their things, people, plans or routines), check Helm on your own, without waiting to be told: list_topics and get_topic for what they have written down, search_tasks and get_calendar. Use only what the tools return; if they find nothing, say so rather than guessing.`,
    canWrite
      ? `When they want to keep what they learned or researched here (they say save this, remember this or tell ${name} about it), call save_to_helm with the learning written out in full, after list_topics so it goes in the topic that fits. For a task, a date or anything to do, use tell_helm.`
      : '',
    `This connection takes text only: it can't receive photos, files, voice notes or any other media, and nothing is attached to what reaches ${name}. When the person shares one and wants it in Helm, say that this connection can't take it, and that they can add it in Helm itself; if it holds words they want kept, you may pass those on as text, saying so.`,
    sourcesBriefFor(name, sources, access),
  ]
    .filter((line) => line !== '')
    .join(' ');

const buildServer = async (ctx: McpRequestContext): Promise<McpServer> => {
  const firestore = getFirestore();
  if (!(await isGateOpenForUid(ctx.uid, GATE_APP_ID, GATE_ID, 'off'))) {
    return refuseAll(OFF_TEXT);
  }
  const key = await unwrapHelmKey(
    firestore,
    loadKeyringOrFail(),
    ctx.uid,
  ).catch(() => null);
  if (!key) return refuseAll(NO_KEY_TEXT);
  const profile = await firestore.doc(`apps/helm/users/${ctx.uid}`).get();
  const name =
    readAssistantName(profile.data()?.assistantName) ?? DEFAULT_ASSISTANT_NAME;
  const [liveGrants, siteGrants, sources] = await Promise.all([
    ctx.readScopes.length > 0 ? readLiveGrants(firestore, ctx.uid) : [],
    ctx.readScopes.length > 0 ? readSiteGrants(firestore, ctx.uid) : [],
    readConnectedSources(firestore, ctx.uid).catch((): ConnectedSource[] => []),
  ]);
  const topicAliases = createSealedAliasBook('tp', ctx.uid, key);
  const tools = buildHelmTools({
    uid: ctx.uid,
    liveGrants: liveGrants.filter(
      (grant) =>
        (grant.connectorId === 'google:gmail' &&
          ctx.readScopes.includes('mail')) ||
        (grant.connectorId === 'google:drive' &&
          ctx.readScopes.includes('drive')),
    ),
    siteGrants: ctx.readScopes.includes('apps') ? siteGrants : [],
    key,
    outsideReadScopes: ctx.readScopes,
    firestore,
    timeZone: (profile.data()?.timeZone as string | undefined) ?? 'UTC',
    mask: {
      isOn: true,
      names: [],
      timeZone: (profile.data()?.timeZone as string | undefined) ?? 'UTC',
    },
    aliases: createSealedAliasBook('t', ctx.uid, key),
    topicRead: {
      topics: topicAliases,
      sections: createAliasBook('s'),
      versions: new Map(),
    },
    procedureRead: {
      procedures: createSealedAliasBook('pr', ctx.uid, key),
      steps: createAliasBook('ps'),
      versions: new Map(),
      names: new Map(),
    },
  });
  const permittedTools = ctx.readScopes.flatMap(
    (scope) => READ_SCOPE_TOOLS[scope],
  );
  const server = new McpServer(
    { name: 'helm', version: '1.0.0' },
    {
      instructions: instructionsFor(name, ctx.canWrite, sources, {
        clientName: ctx.clientName,
        readScopes: ctx.readScopes,
        toolNames: offeredHelmTools(tools, 'external', permittedTools).map(
          (tool) => tool.name,
        ),
      }),
    },
  );
  registerHelmTools(server, tools, 'external', permittedTools);
  if (!ctx.canWrite) return server;
  server.registerTool(
    'tell_helm',
    {
      description: `Tells ${name}, the person's assistant in Helm, something in their own words, as if they had typed it to ${name}: Helm files it for them, making tasks, key dates, notes and records, and says what it did. Call it when the person says "tell ${name}" or wants ${name} or Helm to remember or do something (add a task, note a date). To save what they learned or researched, use save_to_helm instead. Do not use it for a question: use ask_helm. Text only: it can't carry a photo, file or other media, so when the person wants one in Helm, tell them to add it in Helm itself. The person can undo everything it does in Helm.`,
      inputSchema: tellShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ text: words }) => text(await fileTurn({ ctx, key, words })),
  );
  server.registerTool(
    'save_to_helm',
    {
      description: `Saves what the person learned or researched in this chat into ${name}'s Helm, at once and with no waiting, filed under the topic that fits. Call it when the person says save this, remember this or tell ${name} about what they learned. Write the learning out in full in "learned" (the facts, numbers and conclusions themselves, never "remember this" or a pointer to this chat). Call list_topics first and pass the topic that fits, or newTopic when none does. Pass at most 5 sources worth keeping, never every page read. Text only: it can't carry a photo, file or other media. The person can see it, and undo it, in Helm.`,
      inputSchema: saveShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input) =>
      text(
        await saveTurn({
          ctx,
          key,
          name,
          topicIdOf: (alias) => topicAliases.idOf(alias),
          input,
        }),
      ),
  );
  server.registerTool(
    'ask_helm',
    {
      description: `Asks ${name}, the person's assistant in Helm, a question about their own life, in their words, and returns its answer with the records it rests on and, apart, anything it added from general knowledge (labelled "Not from your records"). Call it when the person says "ask ${name}", or for a question that needs more than a quick lookup: dates, people, plans, what they decided or noted. For a plain lookup of tasks, topics, procedures or calendar days, the search tools are quicker. The question shows in Helm's Activity like a typed one.`,
      inputSchema: askShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ question }) => text(await fileTurn({ ctx, key, words: question })),
  );
  return server;
};

export const helmMcp = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    secrets: [
      HELM_MASTER_KEYS,
      ANTHROPIC_API_KEY,
      WORKOS_API_KEY,
      WORKOS_AUTHKIT_DOMAIN,
    ],
    maxInstances: 10,
  },
  createMcpHttpHandler({ appId: 'helm', resource: RESOURCE, buildServer }),
);
