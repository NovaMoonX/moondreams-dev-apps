import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isRunningInEmulator } from '../emulator.js';

if (getApps().length === 0) {
  initializeApp();
}

const ADMIN_EMAIL = 'nova@moondreams.dev';
const MAX_FEEDBACK_IDS = 50;
const ADMIN_LINK_BASE =
  'https://apps.moondreams.dev/admin?view=feedback&feedback=';

// Claude Code routines are a research preview: the beta header and the response key may change.
const ROUTINE_BETA_HEADER = 'experimental-cc-routine-2026-04-01';
const ROUTINE_API_VERSION = '2023-06-01';
const ROUTINE_SESSION_URL_KEY = 'claude_code_session_url';

export interface HandoffItem {
  id: string;
  kind: string;
  status: string;
  text: string;
  context: {
    appId: string | null;
    path: string;
    siteVersion: string;
    userAgent: string;
    viewportWidth: number;
    viewportHeight: number;
  };
}

export interface HandoffMessage {
  kind: string;
  isFromAdmin: boolean;
  text: string | null;
}

const KIND_LABELS: Record<string, string> = {
  bug: 'A bug report',
  idea: 'An idea',
  question: 'A question',
};

const getHeading = (items: HandoffItem[], groupName: string | null): string => {
  if (groupName !== null) {
    return `${items.length} ${items.length === 1 ? 'piece' : 'pieces'} of feedback from the ${groupName} group`;
  }
  if (items.length === 1)
    return KIND_LABELS[items[0].kind] ?? 'A piece of feedback';
  return `${items.length} pieces of feedback`;
};

const getItemLines = (
  item: HandoffItem,
  messages: HandoffMessage[],
): string[] => {
  const { context } = item;
  const replies = messages.filter(
    (message) => message.kind === 'reply' && message.text,
  );
  return [
    `## ${KIND_LABELS[item.kind] ?? 'Feedback'} (${item.status})`,
    `App: ${context.appId ?? 'the site itself'}`,
    `Screen: ${context.path}`,
    `Site version: ${context.siteVersion}`,
    `Device: ${context.userAgent}`,
    `Viewport: ${context.viewportWidth}x${context.viewportHeight}`,
    `Admin link: ${ADMIN_LINK_BASE}${item.id}`,
    '',
    'What they wrote:',
    item.text,
    ...(replies.length === 0
      ? []
      : [
          '',
          'Replies, oldest first:',
          ...replies.map(
            (reply) =>
              `${reply.isFromAdmin ? 'Admin' : 'Sender'}: ${reply.text}`,
          ),
        ]),
  ];
};

/** The text a Claude Code session starts from. Never carries the sender's name or email. */
export function buildFeedbackHandoffText(
  items: HandoffItem[],
  messagesById: Record<string, HandoffMessage[]>,
  group: { name: string } | null,
): string {
  return [
    `# ${getHeading(items, group?.name ?? null)}`,
    ...items.flatMap((item) => [
      '',
      ...getItemLines(item, messagesById[item.id] ?? []),
    ]),
  ].join('\n');
}

/** Starts a session on the connected routine and returns its URL. */
const ROUTINE_TIMEOUT_MS = 30_000;

async function fireRoutine({
  fireUrl,
  token,
  text,
}: {
  fireUrl: string;
  token: string;
  text: string;
}): Promise<string> {
  const response = await fetch(fireUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-beta': ROUTINE_BETA_HEADER,
      'anthropic-version': ROUTINE_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(ROUTINE_TIMEOUT_MS),
  }).catch(() => {
    throw new HttpsError(
      'unavailable',
      "Claude didn't answer in time. Try again in a minute.",
    );
  });
  if (response.status === 401) {
    throw new HttpsError(
      'failed-precondition',
      'Claude rejected the token: paste a new one in Feedback settings.',
    );
  }
  if (!response.ok) {
    throw new HttpsError(
      'unavailable',
      `Claude didn't start a session (status ${response.status}). Try again in a minute.`,
    );
  }
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const sessionUrl = body?.[ROUTINE_SESSION_URL_KEY];
  if (typeof sessionUrl !== 'string') {
    throw new HttpsError(
      'unavailable',
      "Claude didn't start a session (no link came back). Try again in a minute.",
    );
  }
  return sessionUrl;
}

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
        `Pick between 1 and ${MAX_FEEDBACK_IDS} pieces of feedback.`,
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
            .limit(MAX_FEEDBACK_IDS)
            .get()
        ).docs
      : (
          await firestore.getAll(
            ...(feedbackIds as string[]).map((id) =>
              firestore.doc(`feedback/${id}`),
            ),
          )
        ).filter((snap) => snap.exists);
    if (itemSnaps.length === 0) {
      throw new HttpsError('not-found', 'There is no feedback to send.');
    }

    const items = itemSnaps
      .map(
        (snap) =>
          ({ ...snap.data(), id: snap.id }) as HandoffItem & {
            createdAt: number;
          },
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    const messageLists = await Promise.all(
      items.map((item) =>
        firestore
          .collection(`feedback/${item.id}/messages`)
          .orderBy('createdAt', 'asc')
          .get(),
      ),
    );
    const messagesById = Object.fromEntries(
      items.map((item, index) => [
        item.id,
        messageLists[index].docs.map((snap) => snap.data() as HandoffMessage),
      ]),
    );
    const text = buildFeedbackHandoffText(
      items,
      messagesById,
      group ? { name: String(group.data()?.name ?? '') } : null,
    );

    if (isPreview === true) return { text };

    const routine = (
      await firestore.doc('adminSettings/claudeRoutine').get()
    ).data();
    if (
      !routine ||
      typeof routine.fireUrl !== 'string' ||
      typeof routine.token !== 'string'
    ) {
      return { text, sessionUrl: null, reason: 'not-connected' };
    }

    const sessionUrl = await fireRoutine({
      fireUrl: routine.fireUrl,
      token: routine.token,
      text,
    });
    const batch = firestore.batch();
    items.forEach((item) =>
      batch.update(firestore.doc(`feedback/${item.id}`), {
        claudeSessionUrl: sessionUrl,
      }),
    );
    if (groupRef) batch.update(groupRef, { claudeSessionUrl: sessionUrl });
    await batch.commit().catch((error) => {
      logger.error('Saved no session link on the feedback', error);
    });
    return { text, sessionUrl };
  },
);
