import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isRunningInEmulator } from '../emulator.js';

import {
  buildFeedbackHandoffText,
  fireRoutine,
  readClaudeRoutine,
  readHandoffItems,
  RoutineFireError,
} from './claudeHandoff.js';
import {
  omitIds,
  PR_CLOSED_NOTE,
  readUsageDoc,
  toUsageData,
} from './feedbackAutomationPlan.js';

if (getApps().length === 0) {
  initializeApp();
}

const ADMIN_EMAIL = 'nova@moondreams.dev';
const MAX_FEEDBACK_IDS = 50;
export type StartFeedbackClaudeSessionResponse =
  | { text: string }
  | { text: string; sessionUrl: null; reason: 'not-connected' }
  | { text: string; sessionUrl: string };

const usageRef = (firestore: Firestore) =>
  firestore.doc('adminSettings/feedbackAutomationUsage');

/** Re-reads the items and refuses any the scheduler is starting; the rest leave the queue and the usage tallies, so the scheduler cannot fire them too. */
const claimForManualSend = (firestore: Firestore, snaps: DocumentSnapshot[]) =>
  firestore.runTransaction(async (tx): Promise<DocumentSnapshot[]> => {
    const [usageSnap, ...fresh] = await tx.getAll(
      usageRef(firestore),
      ...snaps.map((snap) => snap.ref),
    );
    const existing = fresh.filter((snap) => snap.exists);
    if (existing.length === 0) {
      throw new HttpsError('not-found', 'There is no feedback to send.');
    }
    const sendable = existing.filter(
      (snap) => snap.data()?.agentState !== 'starting',
    );
    if (sendable.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'Claude is already starting a session for this.',
      );
    }
    const waiting = sendable.filter((snap) =>
      ['queued', 'held'].includes(snap.data()?.agentState),
    );
    waiting.forEach((snap) =>
      tx.update(snap.ref, { agentState: 'working', agentNote: null }),
    );
    if (waiting.length > 0) {
      const doc = readUsageDoc(usageSnap.data());
      const ids = waiting.map((snap) => snap.id);
      tx.set(
        usageRef(firestore),
        toUsageData({
          ...doc,
          failures: omitIds(doc.failures, ids),
          claims: omitIds(doc.claims, ids),
        }),
      );
    }
    return sendable;
  });

/** Puts back what a send that surely started nothing took from the queue. */
const giveBackManualSend = (firestore: Firestore, sent: DocumentSnapshot[]) =>
  firestore.runTransaction(async (tx) => {
    const fresh = await tx.getAll(...sent.map((snap) => snap.ref));
    fresh.forEach((snap, index) => {
      const before = sent[index].data();
      const wasWaiting = ['queued', 'held'].includes(before?.agentState);
      if (
        wasWaiting &&
        snap.exists &&
        snap.data()?.agentState === 'working' &&
        (snap.data()?.claudeSessionUrl ?? null) ===
          (before?.claudeSessionUrl ?? null)
      ) {
        tx.update(snap.ref, {
          agentState: before?.agentState,
          agentNote: before?.agentNote ?? null,
        });
      }
    });
  });

/** Saves the session link on the items still there and not being started; a deleted item no longer fails the whole write. */
const recordManualSend = (
  firestore: Firestore,
  sent: DocumentSnapshot[],
  groupRef: DocumentReference | null,
  sessionUrl: string,
) =>
  firestore.runTransaction(async (tx) => {
    const group = groupRef ? await tx.get(groupRef) : null;
    const fresh = await tx.getAll(...sent.map((snap) => snap.ref));
    fresh
      .filter((snap) => snap.exists && snap.data()?.agentState !== 'starting')
      .forEach((snap) =>
        tx.update(snap.ref, {
          claudeSessionUrl: sessionUrl,
          agentPrUrl: null,
          ...(snap.data()?.agentNote === PR_CLOSED_NOTE
            ? { agentNote: null }
            : {}),
        }),
      );
    if (groupRef && group?.exists) {
      tx.update(groupRef, { claudeSessionUrl: sessionUrl });
    }
  });

/** Admin only: builds the handoff for one or several feedback items (or a group) and starts a Claude Code session with it. */
export const startFeedbackClaudeSession = onCall(
  {
    region: 'us-central1',
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<StartFeedbackClaudeSessionResponse> => {
    const email = request.auth?.token.email?.trim().toLowerCase() ?? null;
    const isAdminEmail =
      email === ADMIN_EMAIL && request.auth?.token.email_verified === true;
    const isEmulatorDev =
      isRunningInEmulator() && request.auth?.token.dev === true;
    if (
      !request.auth ||
      (!isAdminEmail && !isEmulatorDev && request.auth.token.admin !== true)
    ) {
      throw new HttpsError(
        'permission-denied',
        'Only the admin can send feedback to Claude.',
      );
    }

    const { feedbackIds, groupId, isPreview } = (request.data ?? {}) as {
      feedbackIds?: unknown;
      groupId?: unknown;
      isPreview?: unknown;
    };
    const hasIds = Array.isArray(feedbackIds);
    const hasGroup = typeof groupId === 'string' && groupId.length > 0;
    if (hasIds === hasGroup) {
      throw new HttpsError(
        'invalid-argument',
        'Send either feedbackIds or a groupId.',
      );
    }
    if (
      hasIds &&
      (feedbackIds.length === 0 ||
        feedbackIds.length > MAX_FEEDBACK_IDS ||
        !feedbackIds.every((id) => typeof id === 'string' && id.length > 0))
    ) {
      throw new HttpsError(
        'invalid-argument',
        feedbackIds.length > MAX_FEEDBACK_IDS
          ? `You picked ${feedbackIds.length} items; Send to Claude takes up to ${MAX_FEEDBACK_IDS}. Split them into smaller groups.`
          : `Pick between 1 and ${MAX_FEEDBACK_IDS} pieces of feedback.`,
      );
    }

    const firestore = getFirestore();
    const groupRef = hasGroup
      ? firestore.doc(`feedbackGroups/${groupId}`)
      : null;
    const group = groupRef ? await groupRef.get() : null;
    if (groupRef && !group?.exists) {
      throw new HttpsError('not-found', 'That group no longer exists.');
    }

    const itemSnaps = groupRef
      ? (
          await firestore
            .collection('feedback')
            .where('groupId', '==', groupId)
            .limit(MAX_FEEDBACK_IDS + 1)
            .get()
        ).docs
      : (
          await firestore.getAll(
            ...(feedbackIds as string[]).map((id) =>
              firestore.doc(`feedback/${id}`),
            ),
          )
        ).filter((snap) => snap.exists);
    if (groupRef && itemSnaps.length > MAX_FEEDBACK_IDS) {
      throw new HttpsError(
        'invalid-argument',
        `This group has more than ${MAX_FEEDBACK_IDS} items; Send to Claude takes up to ${MAX_FEEDBACK_IDS}. Split it into smaller groups.`,
      );
    }
    if (itemSnaps.length === 0) {
      throw new HttpsError('not-found', 'There is no feedback to send.');
    }

    const { items: previewItems, messagesById: previewMessages } =
      await readHandoffItems(firestore, itemSnaps);
    const groupHeading = group
      ? { name: String(group.data()?.name ?? '') }
      : null;
    if (isPreview === true) {
      return {
        text: buildFeedbackHandoffText(
          previewItems,
          previewMessages,
          groupHeading,
        ),
      };
    }

    const routine = await readClaudeRoutine(firestore);
    if (!routine) {
      return {
        text: buildFeedbackHandoffText(
          previewItems,
          previewMessages,
          groupHeading,
        ),
        sessionUrl: null,
        reason: 'not-connected',
      };
    }

    const sendable = await claimForManualSend(firestore, itemSnaps);
    const startSession = async () => {
      const { items, messagesById } = await readHandoffItems(
        firestore,
        sendable,
      );
      const text = buildFeedbackHandoffText(items, messagesById, groupHeading);
      return { text, sessionUrl: await fireRoutine({ ...routine, text }) };
    };
    const { text, sessionUrl } = await startSession().catch(
      async (error: unknown) => {
        if (!(error instanceof RoutineFireError) || error.isDefinite) {
          await giveBackManualSend(firestore, sendable).catch((revertError) => {
            logger.error('Gave back no items after a failed send', {
              name: (revertError as Error).name,
            });
          });
        }
        throw error;
      },
    );
    await recordManualSend(firestore, sendable, groupRef, sessionUrl).catch(
      (error) => {
        logger.error('Saved no session link on the feedback', error);
      },
    );
    return { text, sessionUrl };
  },
);
