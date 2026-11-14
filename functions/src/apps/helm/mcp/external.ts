import { createHash, randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
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
import { createAliasBook, createSealedAliasBook } from '../nomos/aliases.js';
import { readMadeTitles } from '../nomos/buildContext.js';
import {
  ANTHROPIC_API_KEY,
  loadKeyringOrFail,
  runHelmSort,
  type CaptureDoc,
  type SortResult,
} from '../sortHelmCapture.js';
import type { SealedPayload } from '../../../appKeys/seal.js';
import { buildHelmTools } from './buildTools.js';
import { registerHelmTools } from './server.js';

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
const RETRY_WINDOW_MS = 2 * 60 * 1000;
const ALREADY_FILED_TEXT =
  'Helm already has these words from a moment ago, so they were not filed twice. What it did is in Helm\'s Activity.';

/** The same words from the same assistant within two minutes are one turn, so a retried call never files them twice. */
const retryKeyFor = (ctx: McpRequestContext, words: string, now: number) =>
  `mcp_${createHash('sha256')
    .update(
      [ctx.uid, ctx.clientKey, words, Math.floor(now / RETRY_WINDOW_MS)].join('|'),
    )
    .digest('hex')
    .slice(0, 28)}`;

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
  const reference = firestore
    .collection(`apps/helm/users/${ctx.uid}/captures`)
    .doc(retryKeyFor(ctx, words, createdAt));
  const isNew = await reference.create({
    inputMode: 'typed',
    sttProvider: null,
    interruptedCaptureId: null,
    answersQuestion: null,
    ttsProvider: null,
    arrivedVia: 'direct',
    medium: 'mcp',
    via: ctx.clientName,
    sessionId: randomUUID(),
    turnIndex: 0,
    route: null,
    status: 'received',
    heldReason: null,
    claimId: null,
    claimedAt: null,
    attempts: 0,
    lastErrorCode: null,
    questionState: {},
    executionIds: [],
    turnLeadId: null,
    joinedCaptureIds: [],
    attachmentIds: [],
    seenAt: null,
    quotedSourceKeys: [],
    answerSavedNoteId: null,
    whoIds: [],
    placeIds: [],
    planDayKey: null,
    createdAt,
    sortedAt: null,
    screen: null,
    sealed: sealForHelm(key, {
      text: words,
      reading: {
        people: [],
        places: [],
        documents: [],
        commands: [],
        isUrgent: false,
        dates: [],
        addressedAs: null,
      },
      answer: null,
      questionAnswer: null,
    }),
  }).then(
    () => true,
    (error: unknown) => {
      if ((error as { code?: unknown }).code === ALREADY_EXISTS) return false;
      throw error;
    },
  );
  if (!isNew) return ALREADY_FILED_TEXT;
  const result = await runHelmSort({
    uid: ctx.uid,
    captureId: reference.id,
    requestKey: randomUUID(),
    mode: 'full',
    noteIds: [],
  }).catch(
    (): SortResult => ({
      status: 'failed',
      executionId: null,
      releasedIds: [],
      hasAnswer: false,
      spoken: null,
    }),
  );
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

const askShape = {
  question: z
    .string()
    .min(1)
    .max(ASK_MAX_CHARS)
    .describe(
      'A question about the person\'s own life, as they would ask it, such as "When is Grandpa\'s birthday?" or "What did I decide about the kitchen?".',
    ),
};

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
  const tools = buildHelmTools({
    uid: ctx.uid,
    key,
    firestore,
    timeZone: (profile.data()?.timeZone as string | undefined) ?? 'UTC',
    aliases: createSealedAliasBook('t', ctx.uid, key),
    topicRead: {
      topics: createSealedAliasBook('tp', ctx.uid, key),
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
  const server = new McpServer({ name: 'helm', version: '1.0.0' });
  registerHelmTools(server, tools, 'external');
  if (!ctx.canWrite) return server;
  server.registerTool(
    'tell_helm',
    {
      description:
        "Tells Helm something in the person's own words, as if they had typed it to their assistant: Helm files it for them, making tasks, key dates, notes and records, and says what it did. Call it when the person wants Helm to remember or do something (add a task, note a date, save what they learned). Do not use it for a question: use ask_helm. The person can undo everything it does in Helm.",
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
    'ask_helm',
    {
      description:
        'Asks Helm a question about the person\'s own life, in their words, and returns its answer with the records it rests on and, apart, anything it added from general knowledge (labelled "Not from your records"). Call it for a question that needs more than a quick lookup: dates, people, plans, what they decided or noted. For a plain lookup of tasks, topics, procedures or calendar days, the search tools are quicker. The question shows in Helm\'s Activity like a typed one.',
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
    timeoutSeconds: 120,
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
