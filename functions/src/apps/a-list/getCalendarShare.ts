import { timingSafeEqual } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';

import { toSharedCalendar, type SharedCalendar } from './calendarShareView.js';

if (getApps().length === 0) {
  initializeApp();
}

const SHARE_ID_PATTERN = /^[2-9a-hj-np-z]{26}$/;

type ShareResult = { status: 'ok'; calendar: SharedCalendar } | { status: 'pin_required' | 'wrong_pin' | 'not_found' };

function isPinMatch(expected: string, entered: string) {
  const expectedBytes = Buffer.from(expected);
  const enteredBytes = Buffer.from(entered);
  return expectedBytes.length === enteredBytes.length && timingSafeEqual(expectedBytes, enteredBytes);
}

export const getCalendarShare = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 15,
    cors: ['https://apps.moondreams.dev', /^https:\/\/moondreams-dev-apps.*\.web\.app$/],
  },
  async (request): Promise<ShareResult> => {
    const shareId = typeof request.data?.shareId === 'string' ? request.data.shareId : '';
    if (!SHARE_ID_PATTERN.test(shareId)) {
      return { status: 'not_found' };
    }

    const snapshot = await getFirestore().doc(`apps/a-list/calendarShares/${shareId}`).get();
    if (!snapshot.exists) {
      return { status: 'not_found' };
    }

    const data = snapshot.data() ?? {};
    if (data.pin !== null && data.pin !== undefined) {
      const pin = typeof data.pin === 'string' ? data.pin : '';
      if (pin === '') {
        return { status: 'not_found' };
      }

      const entered = typeof request.data?.pin === 'string' ? request.data.pin.trim().toUpperCase() : '';
      if (entered === '') {
        return { status: 'pin_required' };
      }
      if (!isPinMatch(pin, entered)) {
        return { status: 'wrong_pin' };
      }
    }

    return { status: 'ok', calendar: toSharedCalendar(data) };
  },
);
