import { timingSafeEqual } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { createOptionalSecretReader } from '../imageSearch/optionalSecret.js';
import type { FetchLike } from '../imageSearch/types.js';

if (getApps().length === 0) {
  initializeApp();
}

const fetchLike: FetchLike = (url, init) => fetch(url, init);
const readSecret = createOptionalSecretReader({ fetch: fetchLike });

const SESSION_ID = /^[A-Za-z0-9_-]{1,80}$/;
const SESSION_URL = /^https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+$/;
const STATES = ['working', 'waiting', 'idle'];
const CIS = ['green', 'red', 'running', 'none'];
const MAX_HANDS = 5;
const MAX_HAND_LENGTH = 300;
const MAX_PRS = 60;
const MAX_TEXT = 1000;
const MAX_ITEMS = 10;
const MAX_URL = 500;
const MAX_DOC_BYTES = 600_000;
const PR_URL =
  /^https:\/\/github\.com\/NovaMoonX\/moondreams-dev-apps\/pull\/\d+$/;
const STALE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_PRUNED = 20;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown) =>
  typeof value === 'string' ? value.slice(0, MAX_TEXT) : '';
const textOrNull = (value: unknown) =>
  typeof value === 'string' ? value.slice(0, MAX_TEXT) : null;
const texts = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === 'string')
    .slice(0, MAX_ITEMS)
    .map(text);
const uniqueTexts = (value: unknown) => Array.from(new Set(texts(value)));
// Every address here is drawn as a link or loaded as an image on the admin's screen.
const httpsUrl = (value: unknown) =>
  typeof value === 'string' &&
  value.length <= MAX_URL &&
  value.startsWith('https://')
    ? value
    : null;
const httpsUrls = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .slice(0, MAX_ITEMS)
    .flatMap((item) => httpsUrl(item) ?? []);
const sessionUrl = (value: unknown) =>
  typeof value === 'string' && SESSION_URL.test(value) ? value : null;
const list = (value: unknown, max = MAX_ITEMS) =>
  (Array.isArray(value) ? value : []).slice(0, max).filter(isObject);
const MAX_OWNER_LINES = 40;
const keepWaiting = (items: Json[]) => {
  const waiting = items.filter(
    (item) => typeof item.settled !== 'string',
  ).length;
  const room = Math.max(0, MAX_ITEMS - waiting);
  return items
    .filter(
      (item, index) =>
        typeof item.settled !== 'string' ||
        items
          .slice(0, index)
          .filter((other) => typeof other.settled === 'string').length < room,
    )
    .slice(0, MAX_ITEMS);
};
const toMs = (value: unknown) => {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

const toStatus = (value: unknown) => {
  if (!isObject(value)) return null;
  return {
    sessionUrl: sessionUrl(value.sessionUrl),
    sessionTitle: textOrNull(value.sessionTitle),
    state: textOrNull(value.state),
    // Settled lines carried over give way to waiting ones under the cap; the comment's order stays.
    ownerItems: keepWaiting(list(value.ownerItems, MAX_OWNER_LINES)).map(
      (item) => ({
        text: text(item.text),
        options: list(item.options).map((option) => ({
          label: text(option.label),
          images: httpsUrls(option.images),
        })),
        isMulti: item.isMulti === true,
        isTask: item.isTask === true,
        settled:
          item.settled === 'done' || item.settled === 'skipped'
            ? item.settled
            : null,
      }),
    ),
    // Null when there is no Must do list to read, so the dashboard never takes it for an empty one; not capped at ten, since Merge waits on all of it.
    mustDo: Array.isArray(value.mustDo)
      ? value.mustDo
          .filter((item): item is string => typeof item === 'string')
          .slice(0, MAX_OWNER_LINES)
          .map(text)
      : null,
    goodToKnow: texts(value.goodToKnow),
    decisions: uniqueTexts(value.decisions),
    followUps: uniqueTexts(value.followUps),
    screenshots: httpsUrls(value.screenshots),
    updatedAt: toMs(value.updatedAt),
  };
};

const MAX_STEPS = 30;
const MAX_STEP_IMAGES = 3;
const ROLES = ['before', 'after'];

const toGallery = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .slice(0, MAX_STEPS)
    .filter(isObject)
    .map((step) => ({
      label: text(step.label).slice(0, 120),
      note:
        typeof step.note === 'string'
          ? text(step.note).slice(0, 240) || null
          : null,
      images: (Array.isArray(step.images) ? step.images : [])
        .slice(0, MAX_STEP_IMAGES)
        .filter(isObject)
        .flatMap((image) => {
          const src = httpsUrl(image.src);
          return src === null
            ? []
            : [
                {
                  src,
                  role:
                    typeof image.role === 'string' && ROLES.includes(image.role)
                      ? image.role
                      : null,
                },
              ];
        }),
    }))
    .filter((step) => step.images.length > 0);

const toPr = (pr: Json) => ({
  number: typeof pr.number === 'number' ? Math.trunc(pr.number) : 0,
  title: text(pr.title),
  url: typeof pr.url === 'string' && PR_URL.test(pr.url) ? pr.url : '',
  head: text(pr.head),
  base: text(pr.base),
  isDraft: pr.isDraft === true,
  labels: texts(pr.labels),
  ci: typeof pr.ci === 'string' && CIS.includes(pr.ci) ? pr.ci : 'none',
  bodySessionUrl: sessionUrl(pr.bodySessionUrl),
  status: toStatus(pr.status),
  gallery: toGallery(pr.gallery),
});

const isKeyValid = (given: unknown, expected: string) => {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const invalid = (message: string) =>
  new HttpsError('invalid-argument', message);

const HELPER = /^[A-Za-z0-9_-]{1,40}$/;

const readSession = (data: Json) => {
  const { sessionId, state, url, branch, raisedHands, phase, helpers } = data;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) {
    throw invalid('Bad sessionId.');
  }
  if (typeof state !== 'string' || !STATES.includes(state)) {
    throw invalid('Bad state.');
  }
  if (url !== null && !(typeof url === 'string' && SESSION_URL.test(url))) {
    throw invalid('Bad url.');
  }
  if (
    branch !== null &&
    !(typeof branch === 'string' && branch.length <= 200)
  ) {
    throw invalid('Bad branch.');
  }
  if (
    !Array.isArray(raisedHands) ||
    raisedHands.some((hand) => typeof hand !== 'string')
  ) {
    throw invalid('Bad raisedHands.');
  }
  return {
    sessionId,
    state,
    url,
    branch,
    raisedHands: (raisedHands as string[])
      .slice(0, MAX_HANDS)
      .map((hand) => hand.slice(0, MAX_HAND_LENGTH)),
    // Sent by hooks since phases were reported; an older hook sends neither.
    phase: typeof phase === 'string' && PHASES.includes(phase) ? phase : null,
    helpers: (Array.isArray(helpers) ? helpers : [])
      .filter((helper): helper is string => typeof helper === 'string' && HELPER.test(helper))
      .slice(0, MAX_ITEMS),
  };
};

const writeSession = async (data: Json) => {
  const session = readSession(data);
  const db = getFirestore();
  const ref = db.doc(`pipelineSessions/${session.sessionId}`);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const startedAt = snapshot.get('startedAt') as unknown;
    const previousTurn = snapshot.get('turnStartedAt') as unknown;
    const getTurnStartedAt = () => {
      // Only a new prompt starts a turn; a hook from before turnStart starts one on every working report.
      const isTurnStart =
        data.turnStart === true ||
        (data.turnStart === undefined && session.state === 'working');
      if (isTurnStart) return now;
      // A first report that isn't a prompt still needs a start, or the turn would seem to restart on every pulse.
      return typeof previousTurn === 'number' ? previousTurn : now;
    };
    transaction.set(ref, {
      ...session,
      startedAt: typeof startedAt === 'number' ? startedAt : now,
      turnStartedAt: getTurnStartedAt(),
      updatedAt: now,
    });
  });

  const stale = await db
    .collection('pipelineSessions')
    .where('updatedAt', '<', now - STALE_MS)
    .limit(MAX_PRUNED)
    .get();
  if (stale.empty) return;
  const batch = db.batch();
  stale.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
};

const APP_ID = /^[a-z0-9-]{1,40}$/;
const COST_DAY = /^\d{4}-\d{2}-\d{2}$/;
const COST_MODEL = /^[a-z0-9.-]{1,60}$/;
const PHASES = [
  'planning',
  'building',
  'investigating',
  'screenshots',
  'review',
  'checks',
  'conversation',
];
const MAX_COST_ROWS = 600;
const COST_STALE_MS = 180 * 24 * 60 * 60 * 1000;
const COST_COUNTS = [
  'calls',
  'input',
  'cacheWrite5m',
  'cacheWrite1h',
  'cacheRead',
  'output',
] as const;

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const toCostRow = (row: unknown) => {
  if (!isObject(row)) return null;
  const { day, model, phase } = row;
  if (
    typeof day !== 'string' ||
    !COST_DAY.test(day) ||
    typeof model !== 'string' ||
    !COST_MODEL.test(model) ||
    typeof phase !== 'string' ||
    !PHASES.includes(phase)
  ) {
    return null;
  }
  if (COST_COUNTS.some((field) => !isCount(row[field]))) return null;
  return {
    day,
    model,
    phase,
    isHelper: row.isHelper === true,
    ...(Object.fromEntries(
      COST_COUNTS.map((field) => [field, row[field] as number]),
    ) as Record<(typeof COST_COUNTS)[number], number>),
  };
};

const readCost = (data: Json) => {
  const { sessionId, url, branch, app, contextTokens, calls, rows } = data;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) {
    throw invalid('Bad sessionId.');
  }
  if (url !== null && !(typeof url === 'string' && SESSION_URL.test(url))) {
    throw invalid('Bad url.');
  }
  if (
    branch !== null &&
    !(typeof branch === 'string' && branch.length <= 200)
  ) {
    throw invalid('Bad branch.');
  }
  if (app !== null && !(typeof app === 'string' && APP_ID.test(app))) {
    throw invalid('Bad app.');
  }
  if (!isCount(contextTokens) || !isCount(calls)) {
    throw invalid('Bad counts.');
  }
  if (!Array.isArray(rows)) throw invalid('Bad rows.');
  return {
    sessionId,
    url,
    branch,
    app,
    contextTokens,
    calls,
    // A very long session can outgrow the cap; its newest days are the ones worth keeping.
    rows: rows
      .flatMap((row: unknown) => toCostRow(row) ?? [])
      .sort((a, b) => b.day.localeCompare(a.day))
      .slice(0, MAX_COST_ROWS),
  };
};

const writeCost = async (data: Json) => {
  const cost = readCost(data);
  const db = getFirestore();
  const ref = db.doc(`pipelineCost/${cost.sessionId}`);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const startedAt = snapshot.get('startedAt') as unknown;
    const storedCalls = snapshot.get('calls') as unknown;
    // Two quick turns can report out of order; the older count never replaces a newer one.
    if (typeof storedCalls === 'number' && storedCalls > cost.calls) return;
    transaction.set(ref, {
      ...cost,
      startedAt: typeof startedAt === 'number' ? startedAt : now,
      updatedAt: now,
    });
  });

  const stale = await db
    .collection('pipelineCost')
    .where('updatedAt', '<', now - COST_STALE_MS)
    .limit(MAX_PRUNED)
    .get();
  if (stale.empty) return;
  const batch = db.batch();
  stale.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
};

const MAX_MERGED = 50;
// The merged PRs' lists are the part that can grow, so the newest keep theirs until this many bytes.
const MAX_MERGED_LIST_BYTES = 150_000;

const toMerged = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .slice(0, MAX_MERGED)
    .filter(isObject)
    .flatMap((pr) => {
      const mergedAt = toMs(pr.mergedAt);
      if (typeof pr.number !== 'number' || mergedAt === 0) return [];
      const statusAt = toMs(pr.statusAt);
      return [
        {
          number: Math.trunc(pr.number),
          sessionUrl: sessionUrl(pr.sessionUrl),
          mergedAt,
          title: textOrNull(pr.title),
          statusAt: statusAt === 0 ? null : statusAt,
          decisions: Array.isArray(pr.decisions) ? uniqueTexts(pr.decisions) : null,
          followUps: Array.isArray(pr.followUps) ? uniqueTexts(pr.followUps) : null,
        },
      ];
    })
    .reduce<{ kept: unknown[]; bytes: number }>(
      (acc, pr) => {
        const lists = JSON.stringify([pr.decisions, pr.followUps]).length;
        const isOver = acc.bytes + lists > MAX_MERGED_LIST_BYTES;
        return {
          kept: [
            ...acc.kept,
            isOver ? { ...pr, decisions: null, followUps: null } : pr,
          ],
          bytes: isOver ? acc.bytes : acc.bytes + lists,
        };
      },
      { kept: [], bytes: 0 },
    ).kept;

const writeInbox = async (data: Json) => {
  if (!Array.isArray(data.prs)) throw invalid('Bad prs.');
  const all = data.prs.filter(isObject).slice(0, MAX_PRS).map(toPr);
  // Firestore refuses a document over 1 MiB, so the oldest PRs give way rather than the whole write.
  const merged = toMerged(data.merged);
  const room = MAX_DOC_BYTES - JSON.stringify(merged).length;
  const prs = all.filter(
    (_, index) => JSON.stringify(all.slice(0, index + 1)).length <= room,
  );
  await getFirestore()
    .doc('pipeline/inbox')
    .set({ prs, merged, updatedAt: Date.now() });
};

export const recordPipelineEvent = onCall(
  { region: 'us-central1', maxInstances: 5, timeoutSeconds: 30 },
  async (request) => {
    const data: unknown = request.data;
    if (!isObject(data)) throw invalid('Bad request.');

    const secret = await readSecret(
      'PIPELINE_KEY',
      AbortSignal.timeout(10_000),
    );
    if (secret === null) {
      throw new HttpsError('failed-precondition', 'Pipeline reporting is off.');
    }
    if (!isKeyValid(data.key, secret)) {
      logger.warn('recordPipelineEvent: wrong key');
      throw new HttpsError('permission-denied', 'Wrong key.');
    }

    if (data.kind === 'session') await writeSession(data);
    else if (data.kind === 'cost') await writeCost(data);
    else if (data.kind === 'inbox') await writeInbox(data);
    else throw invalid('Unknown kind.');
    return { ok: true };
  },
);
