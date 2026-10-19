import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { sendPushToUsers, toAppUrl } from '../../notifications/sendPush.js';
import {
  getDigestBounds,
  getDigestLink,
  getDigestMessage,
  getDigestRun,
  mergeDigestItems,
  toDigestItems,
  toPackageDigestItems,
  type DigestItem,
  type DigestMessage,
} from './eatSoonDigest.js';

if (getApps().length === 0) {
  initializeApp();
}

const SETTINGS_PATH = 'apps/pinch/settings';
const BOX_LIMIT = 100;
const PACKAGE_LIMIT = 100;
const DEFAULT_LEAD_DAYS = 1;

interface DigestContext {
  today: number;
  leadDays: number;
}

/** One place a note draws its things-to-act-on from. `flag` is the switch under `reminders` in the person's settings; a new source is one more entry here, and one push still goes out. */
interface DigestSource {
  flag: string;
  collect: (
    firestore: Firestore,
    uid: string,
    context: DigestContext,
  ) => Promise<DigestItem[]>;
}

const collectBoxes: DigestSource['collect'] = async (
  firestore,
  uid,
  { today, leadDays },
) => {
  const { from, to } = getDigestBounds(today, leadDays);
  const snapshot = await firestore
    .collection(`apps/pinch/kitchens/${uid}/containers`)
    .where('status', '==', 'IN_STOCK')
    .where('eatBy', '>=', from)
    .where('eatBy', '<=', to)
    .orderBy('eatBy')
    .limit(BOX_LIMIT)
    .get();
  return toDigestItems(
    snapshot.docs.map((box) => ({
      title: box.get('title'),
      eatBy: box.get('eatBy'),
    })),
    today,
  );
};

const collectPackages: DigestSource['collect'] = async (
  firestore,
  uid,
  { today, leadDays },
) => {
  const { from, to } = getDigestBounds(today, leadDays);
  const snapshot = await firestore
    .collection(`apps/pinch/kitchens/${uid}/packages`)
    .where('status', '==', 'IN_STOCK')
    .where('expiresAt', '>=', from)
    .where('expiresAt', '<=', to)
    .orderBy('expiresAt')
    .limit(PACKAGE_LIMIT)
    .get();
  return toPackageDigestItems(
    snapshot.docs.map((pkg) => ({
      ingredientName: pkg.get('ingredientName'),
      expiresAt: pkg.get('expiresAt'),
    })),
    today,
  );
};

export const DIGEST_SOURCES: DigestSource[] = [
  { flag: 'eatSoon', collect: collectBoxes },
  { flag: 'expiring', collect: collectPackages },
];

export interface DigestSent {
  uid: string;
  day: string;
  message: DigestMessage;
  link: string;
}

export interface DigestRun {
  checked: number;
  sent: DigestSent[];
  failed: number;
}

export type SendDigest = (sent: DigestSent) => Promise<void>;

const readReminders = (data: Record<string, unknown>) => {
  const reminders = (data.reminders ?? {}) as Record<string, unknown>;
  const hour = reminders.hour;
  const leadDays = reminders.leadDays;
  return {
    reminders,
    hour:
      typeof hour === 'number' &&
      Number.isInteger(hour) &&
      hour >= 0 &&
      hour <= 23
        ? hour
        : null,
    leadDays:
      typeof leadDays === 'number' &&
      Number.isInteger(leadDays) &&
      leadDays >= 1 &&
      leadDays <= 3
        ? leadDays
        : DEFAULT_LEAD_DAYS,
    timeZone:
      typeof reminders.timeZone === 'string' ? reminders.timeZone : null,
  };
};

/** Takes the day's note for a person inside a transaction, so two runs that overlap send one: the stamp is written before the push, which makes a failed send a skipped day rather than a doubled one. */
const claimDay = (firestore: Firestore, uid: string, day: string) =>
  firestore.runTransaction(async (transaction) => {
    const ref = firestore.doc(`${SETTINGS_PATH}/${uid}`);
    const snapshot = await transaction.get(ref);
    if (snapshot.get('lastDigestDay') === day) return false;
    transaction.update(ref, { lastDigestDay: day });
    return true;
  });

/**
 * Sends each person who turned the note on at most one push a day, in the first half hour of the hour they chose in their own time zone, naming the dishes past their date or due soon. Nothing due sends nothing and writes nothing. The sender is injected so a run can be rehearsed without Firebase Messaging.
 */
export async function runEatSoonDigest(
  firestore: Firestore,
  send: SendDigest,
  now = Date.now(),
): Promise<DigestRun> {
  const snapshots = await Promise.all(
    DIGEST_SOURCES.map((source) =>
      firestore
        .collection(SETTINGS_PATH)
        .where(`reminders.${source.flag}`, '==', true)
        .get(),
    ),
  );
  const people = new Map(
    snapshots
      .flatMap((snapshot) => snapshot.docs)
      .map((doc) => [doc.id, doc.data()]),
  );
  const run: DigestRun = { checked: people.size, sent: [], failed: 0 };

  await Promise.all(
    Array.from(people.entries()).map(async ([uid, data]) => {
      try {
        const { reminders, hour, leadDays, timeZone } = readReminders(data);
        if (hour === null) return;

        const due = getDigestRun(now, {
          hour,
          timeZone,
          lastDigestDay:
            typeof data.lastDigestDay === 'string' ? data.lastDigestDay : null,
        });
        if (due === null) return;

        const items = mergeDigestItems(
          await Promise.all(
            DIGEST_SOURCES.filter(
              (source) => reminders[source.flag] === true,
            ).map((source) =>
              source.collect(firestore, uid, { today: due.today, leadDays }),
            ),
          ),
        );
        const message = getDigestMessage(items);
        if (message === null) return;

        if (!(await claimDay(firestore, uid, due.day))) return;

        const linkPath = getDigestLink(items);
        const link = toAppUrl(linkPath) ?? linkPath;
        const sent = { uid, day: due.day, message, link };
        await send(sent);
        run.sent.push(sent);
      } catch (error) {
        run.failed += 1;
        logger.error('Pinch eat-soon note failed for one person', {
          uid,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  return run;
}

export const sendEatSoonDigest = onSchedule(
  { schedule: 'every 30 minutes', timeoutSeconds: 300 },
  async () => {
    const firestore = getFirestore();
    const messaging = getMessaging();
    const run = await runEatSoonDigest(
      firestore,
      async ({ uid, message, link }) => {
        await sendPushToUsers(firestore, messaging, [uid], {
          title: message.title,
          body: message.body,
          url: link,
        });
      },
    );
    logger.info('Pinch eat-soon notes', {
      checked: run.checked,
      sent: run.sent.length,
      failed: run.failed,
    });
  },
);

export default sendEatSoonDigest;
