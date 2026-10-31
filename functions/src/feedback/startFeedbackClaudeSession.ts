import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isRunningInEmulator } from '../emulator.js';

import {
  buildFeedbackHandoffText,
  fireRoutine,
  readClaudeRoutine,
  readHandoffItems,
} from './claudeHandoff.js';

if (getApps().length === 0) {
  initializeApp();
}

const ADMIN_EMAIL = 'nova@moondreams.dev';
const MAX_FEEDBACK_IDS = 50;
export type StartFeedbackClaudeSessionResponse =
  | { text: string }
  | { text: string; sessionUrl: null; reason: 'not-connected' }
  | { text: string; sessionUrl: string };

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

    const { items, messagesById } = await readHandoffItems(
      firestore,
      itemSnaps,
    );
    const text = buildFeedbackHandoffText(
      items,
      messagesById,
      group ? { name: String(group.data()?.name ?? '') } : null,
    );

    if (isPreview === true) return { text };

    const routine = await readClaudeRoutine(firestore);
    if (!routine) return { text, sessionUrl: null, reason: 'not-connected' };

    const sessionUrl = await fireRoutine({ ...routine, text });
    const batch = firestore.batch();
    items.forEach((item) =>
      batch.update(firestore.doc(`feedback/${item.id}`), {
        claudeSessionUrl: sessionUrl,
        // Sending a queued or held item by hand settles it: the session now has it.
        ...(item.agentState === 'queued' || item.agentState === 'held'
          ? { agentState: 'working', agentNote: null }
          : {}),
      }),
    );
    if (groupRef) batch.update(groupRef, { claudeSessionUrl: sessionUrl });
    await batch.commit().catch((error) => {
      logger.error('Saved no session link on the feedback', error);
    });
    const heldIds = items
      .filter((item) => item.agentState === 'held')
      .map((item) => item.id);
    await Promise.all(
      heldIds.map((id) =>
        firestore
          .doc('adminSettings/feedbackAutomationUsage')
          .update(new FieldPath('failures', id), FieldValue.delete())
          .catch((error) => {
            logger.error('Cleared no failure count', {
              name: (error as Error).name,
            });
          }),
      ),
    );
    return { text, sessionUrl };
  },
);
