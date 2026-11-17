import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import type { Keyring } from '../../../appKeys/keyring.js';
import {
  GoogleHttpError,
  googleSend,
  toReconnectOnRefusal,
} from '../../../connections/google/client.js';
import {
  GOOGLE_SECRETS,
  ReconnectNeeded,
  getGoogleAccessToken,
} from '../../../connections/tokens.js';
import { readAssistantName } from '../assistantName.js';
import { HELM_MASTER_KEYS, loadHelmKeyring } from '../getHelmKey.js';
import { unwrapHelmKey } from '../helmKey.js';
import { DEFAULT_ASSISTANT_NAME } from '../nomos/commands.js';
import {
  CALENDAR_API,
  applyChange,
  deleteLink,
  readGrantState,
  readLinks,
  readRemote,
  readSyncInputs,
  releaseLease,
  takeLease,
  toCalendarGrantId,
  toLinkSubkey,
  userPath,
  writeActivity,
  writeLink,
} from './calendarSyncStore.js';
import {
  buildDesired,
  planWrites,
  readBack,
  toContentHash,
  toEventBody,
  type DesiredEvent,
  type EventLink,
} from './plan.js';

if (getApps().length === 0) {
  initializeApp();
}

const MINUTE = 60_000;
const LEASE = 6 * MINUTE;
const AT_ONCE = 5;
const PEOPLE_AT_ONCE = 5;
const PEOPLE_MAX = 500;
const STOP_STARTING_AFTER = 240_000;

export interface PersonReport {
  state: 'off' | 'busy' | 'ran' | 'reconnect' | 'calendarGone';
  inserted: number;
  patched: number;
  deleted: number;
  readBack: number;
}

const EMPTY_REPORT: PersonReport = {
  state: 'off',
  inserted: 0,
  patched: 0,
  deleted: 0,
  readBack: 0,
};

const eventsUrl = (calendarId: string) =>
  `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;

const inGroups = async <T>(items: T[], run: (item: T) => Promise<unknown>) =>
  Array.from({ length: Math.ceil(items.length / AT_ONCE) }, (_, at) =>
    items.slice(at * AT_ONCE, (at + 1) * AT_ONCE),
  ).reduce(async (done, group) => {
    await done;
    await Promise.all(group.map(run));
  }, Promise.resolve());

const isStatus = (error: unknown, status: number) =>
  error instanceof GoogleHttpError && error.status === status;

const setSyncState = (
  firestore: Firestore,
  uid: string,
  calendarId: string,
  fields: { lastError: string | null; lastWrittenAt?: number },
) =>
  firestore.runTransaction(async (transaction) => {
    const ref = firestore.doc(userPath(uid));
    const snap = await transaction.get(ref);
    if (snap.get('calendarSync.calendarId') !== calendarId) return;
    transaction.update(ref, {
      'calendarSync.lastError': fields.lastError,
      ...(fields.lastWrittenAt === undefined
        ? {}
        : { 'calendarSync.lastWrittenAt': fields.lastWrittenAt }),
    });
  });

/** Keeps one person's chosen calendar in step: reads back what changed there, then writes what changed here. */
export async function syncPerson(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  now: number,
): Promise<PersonReport> {
  const profile = (await firestore.doc(userPath(uid)).get()).data();
  const sync = profile?.calendarSync;
  if (
    !profile ||
    typeof sync !== 'object' ||
    sync === null ||
    typeof sync.accountId !== 'string' ||
    typeof sync.calendarId !== 'string'
  )
    return EMPTY_REPORT;
  const { accountId, calendarId } = sync as {
    accountId: string;
    calendarId: string;
  };
  if (!(await takeLease(firestore, uid, now, LEASE)))
    return { ...EMPTY_REPORT, state: 'busy' };
  try {
    return await run(firestore, keyring, uid, now, {
      profile,
      accountId,
      calendarId,
    });
  } finally {
    await releaseLease(firestore, uid);
  }
}

const run = async (
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  now: number,
  target: {
    profile: Record<string, unknown>;
    accountId: string;
    calendarId: string;
  },
): Promise<PersonReport> => {
  const { profile, accountId, calendarId } = target;
  const timeZone = String(profile.timeZone ?? 'UTC');
  const name =
    readAssistantName(profile.assistantName) ?? DEFAULT_ASSISTANT_NAME;
  const key = await unwrapHelmKey(firestore, keyring, uid);
  const subkey = toLinkSubkey(key);
  const hash = (event: DesiredEvent) => toContentHash(subkey, event);
  const report: PersonReport = { ...EMPTY_REPORT, state: 'ran' };
  try {
    const token = await getGoogleAccessToken(firestore, uid, accountId);
    const grant = await readGrantState(firestore, uid, accountId);
    const grantId = toCalendarGrantId(accountId);
    const links = await readLinks(firestore, uid);
    const remote = await readRemote(firestore, uid, grantId, links);
    const first = await readSyncInputs(firestore, uid, key, now, timeZone);
    const back = readBack({
      now,
      timeZone,
      desired: buildDesired({ now, timeZone, ...first }),
      links,
      remote,
      isReadBack:
        grant !== null &&
        grant.isLive &&
        grant.isEventsOn &&
        grant.calendarIds.includes(calendarId),
      readThrough: grant?.readThrough ?? null,
      hash,
    });
    const applied = await Promise.all(
      back.changes.map((change) => applyChange(firestore, uid, change, now)),
    );
    const refs = [...back.links.keys()];
    const changes = back.changes.map((change, at) => ({
      change,
      isApplied: applied[at],
    }));
    const doneRefs = refs.filter((_, at) => applied[at]);
    await Promise.all(
      changes.flatMap(({ change, isApplied }) =>
        isApplied
          ? [
              writeActivity(
                firestore,
                uid,
                key,
                change.line,
                now,
                change.isPrivate,
              ),
            ]
          : [],
      ),
    );
    await Promise.all(
      doneRefs.map((ref) => {
        const link = back.links.get(ref) ?? null;
        return link
          ? writeLink(firestore, uid, link)
          : deleteLink(firestore, uid, ref);
      }),
    );
    report.readBack = changes.filter((entry) => entry.isApplied).length;
    const latest = await readLinks(firestore, uid);
    const second =
      report.readBack > 0
        ? await readSyncInputs(firestore, uid, key, now, timeZone)
        : first;
    const plan = planWrites({
      calendarId,
      now,
      timeZone,
      desired: buildDesired({ now, timeZone, ...second }),
      links: latest,
      remote,
      hash,
    });

    const stillOn =
      (await firestore.doc(userPath(uid)).get()).get(
        'calendarSync.calendarId',
      ) === calendarId;
    if (!stillOn) return { ...report, state: 'off' };

    await inGroups(plan.inserts, async (event) => {
      const made = await googleSend<{ id?: string }>(
        token,
        'POST',
        eventsUrl(calendarId),
        toEventBody(event, name),
      ).catch(toReconnectOnRefusal);
      if (typeof made?.id !== 'string') return;
      const link: EventLink = {
        helmRef: event.ref,
        eventId: made.id,
        calendarId,
        startAt: event.startAt,
        endAt: event.endAt,
        contentHash: hash(event),
        writtenAt: Date.now(),
        removedAt: null,
      };
      await writeLink(firestore, uid, link);
      report.inserted += 1;
    });
    await inGroups(plan.patches, async ({ event, link }) => {
      try {
        await googleSend(
          token,
          'PATCH',
          `${eventsUrl(calendarId)}/${encodeURIComponent(link.eventId)}`,
          toEventBody(event, name),
        ).catch(toReconnectOnRefusal);
      } catch (error) {
        if (isStatus(error, 404)) return;
        throw error;
      }
      await writeLink(firestore, uid, {
        ...link,
        startAt: event.startAt,
        endAt: event.endAt,
        contentHash: hash(event),
        writtenAt: Date.now(),
      });
      report.patched += 1;
    });
    await inGroups(plan.deletes, async (link) => {
      await googleSend(
        token,
        'DELETE',
        `${eventsUrl(calendarId)}/${encodeURIComponent(link.eventId)}`,
      ).catch((error: unknown) => {
        if (isStatus(error, 404) || isStatus(error, 410)) return;
        return toReconnectOnRefusal(error);
      });
      await deleteLink(firestore, uid, link.helmRef);
      report.deleted += 1;
    });
    await Promise.all(
      plan.drops.map((link) => deleteLink(firestore, uid, link.helmRef)),
    );
    await setSyncState(firestore, uid, calendarId, {
      lastError: null,
      ...(report.inserted + report.patched + report.deleted > 0
        ? { lastWrittenAt: Date.now() }
        : {}),
    });
    return report;
  } catch (error) {
    if (error instanceof ReconnectNeeded) {
      await setSyncState(firestore, uid, calendarId, {
        lastError: 'reconnect',
      });
      return { ...report, state: 'reconnect' };
    }
    if (isStatus(error, 404)) {
      await setSyncState(firestore, uid, calendarId, {
        lastError: 'calendarGone',
      });
      return { ...report, state: 'calendarGone' };
    }
    throw error;
  }
};

export interface RunReport {
  people: number;
  ran: number;
  failed: number;
  deferred: number;
}

const readPeople = async (firestore: Firestore) =>
  (
    await firestore
      .collection('apps/helm/users')
      .where('calendarSync.accountId', '>', '')
      .limit(PEOPLE_MAX)
      .get()
  ).docs.map((doc) => doc.id);

/** Keeps every person's chosen calendar in step, a few people at a time; a person who fails is logged and the rest go on. */
export async function runCalendarSync(
  firestore: Firestore,
  keyring: Keyring,
  now: number,
): Promise<RunReport> {
  const people = await readPeople(firestore);
  const startedAt = Date.now();
  const report: RunReport = {
    people: people.length,
    ran: 0,
    failed: 0,
    deferred: 0,
  };
  await Array.from(
    { length: Math.ceil(people.length / PEOPLE_AT_ONCE) },
    (_, at) => people.slice(at * PEOPLE_AT_ONCE, (at + 1) * PEOPLE_AT_ONCE),
  ).reduce(async (done, group) => {
    await done;
    if (Date.now() - startedAt > STOP_STARTING_AFTER) {
      report.deferred += group.length;
      return;
    }
    await Promise.all(
      group.map((uid) =>
        syncPerson(firestore, keyring, uid, now).then(
          (result) => {
            if (result.state === 'ran') report.ran += 1;
          },
          (error: unknown) => {
            report.failed += 1;
            logger.error('helm.calendarSync.failed', {
              who: uid.slice(0, 4),
              name: error instanceof Error ? error.name : 'error',
            });
          },
        ),
      ),
    );
  }, Promise.resolve());
  return report;
}

/** Writes each person's kept plan, habit windows and appointments to the one calendar they chose, and reads back what they changed there. */
export const runHelmCalendarSync = onSchedule(
  {
    schedule: '*/10 * * * *',
    timeoutSeconds: 300,
    secrets: [HELM_MASTER_KEYS, ...GOOGLE_SECRETS],
  },
  async () => {
    const report = await runCalendarSync(
      getFirestore(),
      loadHelmKeyring(),
      Date.now(),
    );
    logger.info('helm.calendarSync.ran', report);
  },
);

export default runHelmCalendarSync;
