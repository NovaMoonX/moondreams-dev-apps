import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { assertGateOpen } from '../../../gates/assertGateOpen.js';
import { loadKeyring, RUNWAY_MASTER_KEYS } from '../getRunwayKey.js';
import { openWithKey, unwrapPlanKey, type SealedPayload } from '../planKey.js';
import {
  buildEmailPurchase,
  isInsideTracking,
  markWithRetry,
} from './emailPurchase.js';
import {
  EMAIL_PURCHASES_GATE_ID,
  emailEventsPath,
  planPath,
} from './emailShared.js';
import { readAlertWithAi } from './readAlertWithAi.js';

if (getApps().length === 0) {
  initializeApp();
}

const ADDABLE = new Set(['notPurchase', 'unread']);

/** Turns an email Runway didn't take as a purchase into one, at the person's word: the AI reads its kept text for the amount and the shop, and the purchase is the same one an email read on arrival makes. */
export const addRunwayEmailPurchase = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 30,
    secrets: [RUNWAY_MASTER_KEYS],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    await assertGateOpen(
      request,
      'runway',
      EMAIL_PURCHASES_GATE_ID,
      'off',
      'Purchases from email are not open for you yet.',
    );
    const uid = request.auth?.uid as string;
    const eventId = (request.data as { eventId?: unknown } | null)?.eventId;
    if (
      typeof eventId !== 'string' ||
      eventId === '' ||
      eventId.includes('/')
    ) {
      throw new HttpsError('invalid-argument', 'Pick an email first.');
    }
    const firestore = getFirestore();
    const eventRef = firestore.doc(`${emailEventsPath(uid)}/${eventId}`);
    const snapshot = await eventRef.get();
    const stored = snapshot.data();
    if (stored === undefined) {
      throw new HttpsError('not-found', 'That email is no longer kept.');
    }
    if (!ADDABLE.has(stored.outcome) || stored.purchaseId != null) {
      throw new HttpsError(
        'failed-precondition',
        'This email is already a purchase.',
      );
    }
    const planKey = await unwrapPlanKey(firestore, loadKeyring(), uid);
    const event = openWithKey(planKey.key, stored.sealed as SealedPayload);
    const text =
      typeof event.bodyText === 'string' && event.bodyText !== ''
        ? event.bodyText
        : String(event.snippet ?? '');
    const alert = await readAlertWithAi({
      from: String(event.from ?? ''),
      subject: String(event.subject ?? ''),
      text,
      receivedAt: stored.receivedAt as number,
      isKnownPurchase: true,
    });
    if (alert !== null && !alert.isPurchase) {
      throw new HttpsError(
        'failed-precondition',
        'This email reads as a refund or a cancelled order, so it stays out of your purchases.',
      );
    }
    if (alert === null || alert.amountCents === null) {
      throw new HttpsError(
        'failed-precondition',
        'Runway couldn’t find an amount in this email. Add it from Add a purchase instead.',
      );
    }
    const now = Date.now();
    const plan = (await firestore.doc(planPath(uid)).get()).data();
    if (
      !isInsideTracking(
        plan?.trackingPeriods as { from: number; to: number | null }[],
        alert.date as number,
      )
    ) {
      throw new HttpsError(
        'failed-precondition',
        'You weren’t tracking purchases on the day of this email.',
      );
    }
    const purchase = await buildEmailPurchase({
      firestore,
      uid,
      planKey,
      alert,
      storeEmail: alert.storeEmail,
      returnOutcome: null,
      eventId,
      now,
    });
    await firestore.runTransaction(async (transaction) => {
      const latest = (await transaction.get(eventRef)).data();
      if (latest === undefined || latest.purchaseId != null) {
        throw new HttpsError(
          'failed-precondition',
          'This email is already a purchase.',
        );
      }
      transaction.create(purchase.ref, purchase.data);
      transaction.update(eventRef, {
        outcome: 'purchase',
        purchaseId: purchase.ref.id,
      });
    });
    await markWithRetry(firestore, uid, alert.date as number, now);
    return { purchaseId: purchase.ref.id };
  },
);
