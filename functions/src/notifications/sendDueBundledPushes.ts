import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { sendDueBundledPushes as sendDue } from './bundledPush.js';

if (getApps().length === 0) {
  initializeApp();
}

/** Sends the bundled pushes whose window has ended (or whose quiet hours have), every minute, for every app that queues them. */
export const sendDueBundledPushes = onSchedule(
  { schedule: '* * * * *', timeoutSeconds: 120 },
  async () => {
    const sent = await sendDue(getFirestore(), getMessaging(), Date.now());
    logger.info('Bundled pushes sent', { sent });
  },
);

export default sendDueBundledPushes;
