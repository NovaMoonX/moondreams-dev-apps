import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

import {
  APP_ORIGIN,
  sendPushToUsers,
  toAppUrl,
} from '../notifications/sendPush.js';

if (getApps().length === 0) {
  initializeApp();
}

const REPLY_USEFUL_FOR_MS = 7 * 24 * 60 * 60 * 1000;
const PREVIEW_LENGTH = 120;

const ABOUT_BY_KIND: Record<string, string> = {
  bug: 'your bug report',
  idea: 'your idea',
  question: 'your question',
};

/** The reply's opening words, on one line, cut at a space where it can be. */
export function toReplyPreview(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= PREVIEW_LENGTH) {
    return oneLine;
  }
  const cut = oneLine.slice(0, PREVIEW_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > PREVIEW_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Tells the sender when the admin replies to their feedback. Status changes stay quiet: they show up in the inbox. */
export const notifyFeedbackReply = onDocumentCreated(
  {
    document: 'feedback/{feedbackId}/messages/{messageId}',
    region: 'us-central1',
  },
  async (event) => {
    const message = event.data?.data();
    if (!message || message.isFromAdmin !== true || message.kind !== 'reply') {
      return;
    }

    const firestore = getFirestore();
    const feedback = (
      await firestore.doc(`feedback/${event.params.feedbackId}`).get()
    ).data();
    if (!feedback || typeof feedback.uid !== 'string') {
      return;
    }

    const about = ABOUT_BY_KIND[feedback.kind] ?? 'your feedback';
    const preview =
      typeof message.text === 'string' ? toReplyPreview(message.text) : '';
    try {
      const devices = await sendPushToUsers(
        firestore,
        getMessaging(),
        [feedback.uid],
        {
          title: 'You have a reply',
          body: preview ? `About ${about}: ${preview}` : `About ${about}`,
          url:
            toAppUrl(`/inbox?feedback=${event.params.feedbackId}`) ??
            APP_ORIGIN,
          usefulForMs: REPLY_USEFUL_FOR_MS,
        },
      );
      logger.info('Feedback reply pushed', { devices });
    } catch (error) {
      logger.error('Feedback reply push failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export default notifyFeedbackReply;
