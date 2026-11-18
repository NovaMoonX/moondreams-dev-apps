import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { Keyring } from '../../../appKeys/keyring.js';
import { readDates, readIsUrgent } from '../dateReading.js';
import { HELM_MASTER_KEYS } from '../getHelmKey.js';
import { unwrapHelmKey, sealForHelm, type HelmKey } from '../helmKey.js';
import {
  ANTHROPIC_API_KEY,
  loadKeyringOrFail,
  runHelmSort,
  type SortResult,
} from '../sortHelmCapture.js';
import { actionsQuery, openStoredAction } from './actionStore.js';
import {
  decideRun,
  isHeldError,
  settleRun,
  type RunDecision,
} from './runAction.js';

if (getApps().length === 0) {
  initializeApp();
}

const MINUTE = 60_000;
const CHANGED_BEHIND = 24 * 60 * MINUTE;
const CHANGED_AHEAD = 10 * MINUTE;
const LEASE = 4 * MINUTE;
const PEOPLE_MAX = 100;
const AT_ONCE = 5;
const STOP_STARTING_AFTER = 180_000;
const ALREADY_EXISTS = 6;
const NOT_FOUND = 5;
const OPENED = new Set(['sorted', 'needsYou', 'failed']);

const queuePath = (uid: string) => `apps/helm/actionQueue/${uid}`;

export interface RunReport {
  people: number;
  ran: number;
  patched: number;
  failed: number;
  deferred: number;
}

export type SortOne = (uid: string, captureId: string) => Promise<SortResult>;

const sortOne: SortOne = (uid, captureId) =>
  runHelmSort({
    uid,
    captureId,
    requestKey: `sa_${captureId}`,
    mode: 'full',
    noteIds: [],
  });

const readLookAt = (docs: Record<string, unknown>[], now: number) => {
  const times = docs.flatMap((doc) => {
    if (doc.status !== 'active') return [];
    if (typeof doc.runNowAt === 'number') return [now];
    if (doc.lastOutcome === 'waiting') return [];
    return typeof doc.nextRunAt === 'number' ? [doc.nextRunAt] : [];
  });
  return times.length === 0 ? null : Math.min(...times);
};

const makeCapture = async (input: {
  firestore: Firestore;
  uid: string;
  key: HelmKey;
  decision: Extract<RunDecision, { kind: 'run' }>;
  actionId: string;
  words: { title: string; instruction: string | null };
  held: Record<string, unknown>[] | null;
  allowed: string[];
  timeZone: string;
  now: number;
}) => {
  const { decision, words } = input;
  const text = words.instruction ?? words.title;
  await input.firestore
    .doc(`apps/helm/users/${input.uid}/captures/${decision.captureId}`)
    .create({
      inputMode: 'typed',
      sttProvider: null,
      interruptedCaptureId: null,
      answersQuestion: null,
      ttsProvider: null,
      arrivedVia: 'scheduled',
      scheduledActionId: input.actionId,
      heldCommands: input.held,
      allowedKinds: input.allowed,
      medium: 'web',
      sessionId: decision.captureId,
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
      dismissedAt: null,
      answerSavedNoteId: null,
      whoIds: [],
      placeIds: [],
      planDayKey: null,
      aimsDayKey: null,
      createdAt: input.now,
      sortedAt: null,
      screen: null,
      sealed: sealForHelm(input.key, {
        text,
        reading: {
          people: [],
          places: [],
          documents: [],
          commands: [],
          isUrgent: readIsUrgent(text),
          dates: readDates(text, { now: input.now, timeZone: input.timeZone }),
          addressedAs: null,
        },
        answer: null,
        questionAnswer: null,
      }),
    })
    .catch((error: unknown) => {
      if ((error as { code?: unknown }).code !== ALREADY_EXISTS) throw error;
    });
};

const closeWaiting = async (
  firestore: Firestore,
  base: string,
  captureId: string,
  now: number,
) => {
  const ref = firestore.doc(`${base}/captures/${captureId}`);
  await firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.data()?.status !== 'received') return;
    transaction.update(ref, { status: 'failed', dismissedAt: now });
  });
};

const applyPatch = (
  firestore: Firestore,
  ref: ReturnType<Firestore['doc']>,
  patch: Record<string, unknown>,
  editedAt: number | null,
) =>
  firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return;
    const isEdited = (snap.data()?.lastEditedAt ?? null) !== editedAt;
    const keep = [
      'lastRunAt',
      'lastRunDueAt',
      'lastRunCaptureId',
      'lastOutcome',
      'lastFailReason',
      'runNowAt',
    ];
    transaction.update(
      ref,
      isEdited
        ? Object.fromEntries(
            Object.entries(patch).filter(([field]) => keep.includes(field)),
          )
        : patch,
    );
  });

async function runPerson(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  now: number,
  sort: SortOne,
  report: RunReport,
) {
  const base = `apps/helm/users/${uid}`;
  const queueRef = firestore.doc(queuePath(uid));
  const isLeased = await firestore.runTransaction(async (transaction) => {
    const [snap, profileSnap] = await Promise.all([
      transaction.get(queueRef),
      transaction.get(firestore.doc(base)),
    ]);
    const until = snap.data()?.leaseUntil;
    if (typeof until === 'number' && until > now) return false;
    const lookAt = snap.data()?.lookAt;
    const stamp = profileSnap.data()?.scheduledActionsChangedAt;
    if (
      typeof stamp === 'number' &&
      snap.data()?.plannedChangedAt === stamp &&
      (typeof lookAt !== 'number' || lookAt > now)
    )
      return false;
    transaction.set(queueRef, { leaseUntil: now + LEASE }, { merge: true });
    return true;
  });
  if (!isLeased) return;
  const profile = (await firestore.doc(base).get()).data();
  if (!profile) {
    await queueRef.delete();
    return;
  }
  const homeZone = String(profile.timeZone ?? 'UTC');
  const changedAt =
    typeof profile.scheduledActionsChangedAt === 'number'
      ? profile.scheduledActionsChangedAt
      : null;
  const key = await unwrapHelmKey(firestore, keyring, uid);
  const snap = await actionsQuery(firestore, base).get();
  await Promise.all(
    snap.docs.map(async (entry) => {
      const stored = openStoredAction(key, entry.id, entry.data());
      const decision = decideRun({ stored, homeZone, now, changedAt });
      if (decision.kind === 'none') return;
      const editedAt = (entry.data().lastEditedAt ?? null) as number | null;
      if (decision.kind === 'patch') {
        await applyPatch(firestore, entry.ref, decision.patch, editedAt);
        if (decision.closes)
          await closeWaiting(firestore, base, decision.closes, now);
        report.patched += 1;
        return;
      }
      if (decision.closes)
        await closeWaiting(firestore, base, decision.closes, now);
      if (!(await firestore.doc(base).get()).exists) return;
      await makeCapture({
        firestore,
        uid,
        key,
        decision,
        actionId: entry.id,
        words: stored.words ?? { title: 'Scheduled', instruction: null },
        held: stored.words?.heldCommands ?? null,
        allowed: Array.isArray(stored.doc.allowed)
          ? (stored.doc.allowed as string[])
          : [],
        timeZone: stored.doc.timeZone ? String(stored.doc.timeZone) : homeZone,
        now,
      });
      const capture = await firestore
        .doc(`${base}/captures/${decision.captureId}`)
        .get();
      const status = String(capture.data()?.status ?? '');
      const result = OPENED.has(status)
        ? ({
            status,
            executionId: capture.data()?.executionIds?.[0] ?? null,
            releasedIds: [],
            hasAnswer: false,
            spoken: null,
            abilityOffer: null,
          } as SortResult)
        : await sort(uid, decision.captureId).catch((error: unknown) => {
            if (isHeldError(error)) return { held: 'limit' };
            logger.warn('helm.scheduled.sortFailed', {
              who: uid.slice(0, 4),
              name: error instanceof Error ? error.name : 'error',
            });
            return { error: true as const };
          });
      const patch = settleRun(decision, result, now);
      if (patch) {
        await applyPatch(firestore, entry.ref, patch, editedAt);
        report.ran += 1;
      }
    }),
  );
  const after = await actionsQuery(firestore, base).get();
  await queueRef
    .update({
      lookAt: readLookAt(
        after.docs.map((entry) => entry.data()),
        now,
      ),
      plannedAt: now,
      plannedChangedAt: changedAt,
      leaseUntil: null,
    })
    .catch((error: unknown) => {
      if ((error as { code?: unknown }).code !== NOT_FOUND) throw error;
    });
}

const readPeople = async (firestore: Firestore, now: number) => {
  const [due, changed] = await Promise.all([
    firestore
      .collection('apps/helm/actionQueue')
      .where('lookAt', '<=', now)
      .limit(PEOPLE_MAX)
      .get(),
    firestore
      .collection('apps/helm/users')
      .where('scheduledActionsChangedAt', '>=', now - CHANGED_BEHIND)
      .where('scheduledActionsChangedAt', '<=', now + CHANGED_AHEAD)
      .orderBy('scheduledActionsChangedAt', 'desc')
      .limit(PEOPLE_MAX)
      .get(),
  ]);
  const all = [
    ...new Set([
      ...due.docs.map((doc) => doc.id),
      ...changed.docs.map((doc) => doc.id),
    ]),
  ];
  return { people: all.slice(0, PEOPLE_MAX), cut: all.length - PEOPLE_MAX };
};

const runGroups = async (
  firestore: Firestore,
  keyring: Keyring,
  groups: string[][],
  now: number,
  startedAt: number,
  sort: SortOne,
  report: RunReport,
): Promise<RunReport> => {
  if (groups.length === 0) return report;
  if (Date.now() - startedAt > STOP_STARTING_AFTER) {
    report.deferred += groups.flat().length;
    return report;
  }
  await Promise.all(
    groups[0].map((uid) =>
      runPerson(firestore, keyring, uid, now, sort, report).catch(
        async (error: unknown) => {
          report.failed += 1;
          logger.error('helm.scheduled.runFailed', {
            who: uid.slice(0, 4),
            name: error instanceof Error ? error.name : 'error',
          });
          await firestore
            .doc(queuePath(uid))
            .set({ leaseUntil: null }, { merge: true })
            .catch(() => undefined);
        },
      ),
    ),
  );
  return runGroups(
    firestore,
    keyring,
    groups.slice(1),
    now,
    startedAt,
    sort,
    report,
  );
};

/** Runs every scheduled action that has come due, for everyone, and never sends a push. */
export async function runScheduledActions(
  firestore: Firestore,
  keyring: Keyring,
  now: number,
  sort: SortOne = sortOne,
): Promise<RunReport> {
  const { people, cut } = await readPeople(firestore, now);
  const groups = Array.from(
    { length: Math.ceil(people.length / AT_ONCE) },
    (_, index) => people.slice(index * AT_ONCE, (index + 1) * AT_ONCE),
  );
  return runGroups(firestore, keyring, groups, now, Date.now(), sort, {
    people: people.length,
    ran: 0,
    patched: 0,
    failed: 0,
    deferred: Math.max(0, cut),
  });
}

export const runHelmScheduledActions = onSchedule(
  {
    schedule: '*/5 * * * *',
    timeoutSeconds: 240,
    secrets: [HELM_MASTER_KEYS, ANTHROPIC_API_KEY],
  },
  async () => {
    const report = await runScheduledActions(
      getFirestore(),
      loadKeyringOrFail(),
      Date.now(),
    );
    logger.info('helm.scheduled.ran', report);
  },
);

export default runHelmScheduledActions;
