import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { queueBundledPush } from '../../notifications/bundledPush.js';
import {
  clipName,
  getInquiryUrl,
  isNewInterest,
  isPushOff,
  isSaleListening,
} from './bundleHooks.js';

if (getApps().length === 0) {
  initializeApp();
}

const APP_ID = 'going-once';

/** Tells the sale's sellers about a new inquiry, or one a resend turned from Handled back to New, through the bundled push (the first at once, the rest within 15 minutes as one, nothing overnight). A push failure never touches the inquiry. */
export const notifySaleInquiry = onDocumentWritten(
  {
    document: 'apps/going-once/sales/{saleId}/inquiries/{inquiryId}',
    region: 'us-central1',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!isNewInterest(before, after) || !after) {
      return;
    }

    const { saleId, inquiryId } = event.params;
    const firestore = getFirestore();
    try {
      const sale = (
        await firestore.doc(`apps/going-once/sales/${saleId}`).get()
      ).data();
      if (!sale || !Array.isArray(sale.members)) {
        return;
      }

      const members = sale.members.filter(
        (uid): uid is string =>
          typeof uid === 'string' && isSaleListening(sale, uid),
      );
      const people = await Promise.all(
        members.map((uid) =>
          firestore.doc(`apps/going-once/people/${uid}`).get(),
        ),
      );
      const recipients = members.filter(
        (_, index) => !isPushOff(people[index].data(), saleId),
      );
      if (recipients.length === 0) {
        return;
      }

      const now = Date.now();
      const item = {
        key: inquiryId,
        groupId: saleId,
        label: clipName(after.itemTitleAtSend, 'A thing'),
        groupLabel: clipName(sale.name, 'Your sale'),
        url: getInquiryUrl(saleId, inquiryId),
        queuedAt: now,
      };
      const zone = typeof sale.timeZone === 'string' ? sale.timeZone : null;
      const messaging = getMessaging();
      const settled = await Promise.allSettled(
        recipients.map((uid) =>
          queueBundledPush(firestore, messaging, APP_ID, uid, item, zone, now),
        ),
      );
      const failed = settled.filter(
        (result) => result.status === 'rejected',
      ).length;
      logger.info('Inquiry push queued', {
        recipients: recipients.length,
        failed,
      });
    } catch (error) {
      logger.error('Inquiry push failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export default notifySaleInquiry;
