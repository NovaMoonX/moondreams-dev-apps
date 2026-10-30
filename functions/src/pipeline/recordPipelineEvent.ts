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
const list = (value: unknown) =>
  (Array.isArray(value) ? value : []).slice(0, MAX_ITEMS).filter(isObject);
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
    ownerItems: list(value.ownerItems).map((item) => ({
      text: text(item.text),
      options: list(item.options).map((option) => ({
        label: text(option.label),
        images: httpsUrls(option.images),
      })),
    })),
    goodToKnow: texts(value.goodToKnow),
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

const readSession = (data: Json) => {
  const { sessionId, state, url, branch, raisedHands } = data;
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
      if (session.state === 'working') return now;
      return typeof previousTurn === 'number' ? previousTurn : null;
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

const writeInbox = async (data: Json) => {
  if (!Array.isArray(data.prs)) throw invalid('Bad prs.');
  const all = data.prs.filter(isObject).slice(0, MAX_PRS).map(toPr);
  // Firestore refuses a document over 1 MiB, so the oldest PRs give way rather than the whole write.
  const prs = all.filter(
    (_, index) =>
      JSON.stringify(all.slice(0, index + 1)).length <= MAX_DOC_BYTES,
  );
  await getFirestore()
    .doc('pipeline/inbox')
    .set({ prs, updatedAt: Date.now() });
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
    else if (data.kind === 'inbox') await writeInbox(data);
    else throw invalid('Unknown kind.');
    return { ok: true };
  },
);
