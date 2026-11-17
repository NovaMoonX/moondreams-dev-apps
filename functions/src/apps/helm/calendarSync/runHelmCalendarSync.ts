import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import type { Keyring } from '../../../appKeys/keyring.js';
import {
  GoogleHttpError,
  googleGet,
  googleSend,
  isRateLimited,
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
  toEventId,
  type DesiredEvent,
  type EventLink,
} from './plan.js';

if (getApps().length === 0) {
  initializeApp();
}

const MINUTE = 60_000;
const LEASE = 6 * MINUTE;
const AT_ONCE = 3;
const PEOPLE_AT_ONCE = 5;
const PEOPLE_MAX = 500;
const STOP_STARTING_AFTER = 240_000;

export interface PersonReport {
  state: 'off' | 'busy' | 'ran' | 'reconnect' | 'calendarGone' | 'rateLimited';
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

const toNumberOr = (value: unknown) => (typeof value === 'number' ? value : 0);

const isStillOn = async (
  firestore: Firestore,
  uid: string,
  calendarId: string,
) =>
  (await firestore.doc(userPath(uid)).get()).get('calendarSync.calendarId') ===
  calendarId;

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
    return await run(firestore, keyring, uid, {
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
  target: {
    profile: Record<string, unknown>;
    accountId: string;
    calendarId: string;
  },
): Promise<PersonReport> => {
  const { profile, accountId, calendarId } = target;
  const now = Date.now();
  const generation = toNumberOr(
    (profile.calendarSync as { startedAt?: unknown }).startedAt,
  );
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

    if (!(await isStillOn(firestore, uid, calendarId)))
      return { ...report, state: 'off' };

    const insert = (event: DesiredEvent, id: string) =>
      googleSend<{ id?: string }>(token, 'POST', eventsUrl(calendarId), {
        ...toEventBody(event, name),
        id,
      });
    const made: EventLink[] = [];
    await inGroups(plan.inserts, async (event) => {
      const id = toEventId(calendarId, event.ref, generation);
      const eventId = await insert(event, id)
        .then((created) => (typeof created?.id === 'string' ? created.id : id))
        .catch(async (error: unknown) => {
          if (!isStatus(error, 409)) return toReconnectOnRefusal(error);
          const existing = await googleGet<{ status?: string }>(
            token,
            `${eventsUrl(calendarId)}/${encodeURIComponent(id)}`,
          ).catch(() => null);
          if (existing?.status !== 'cancelled') return id;
          const fresh = toEventId(
            calendarId,
            event.ref,
            `${generation}:${Date.now()}`,
          );
          await insert(event, fresh).catch(toReconnectOnRefusal);
          return fresh;
        });
      const link: EventLink = {
        helmRef: event.ref,
        eventId,
        calendarId,
        startAt: event.startAt,
        endAt: event.endAt,
        contentHash: hash(event),
        writtenAt: Date.now(),
        removedAt: null,
      };
      made.push(link);
      await writeLink(firestore, uid, link);
      report.inserted += 1;
    });
    if (made.length > 0 && !(await isStillOn(firestore, uid, calendarId))) {
      await inGroups(made, async (link) => {
        await googleSend(
          token,
          'DELETE',
          `${eventsUrl(calendarId)}/${encodeURIComponent(link.eventId)}`,
        ).catch(() => undefined);
        await deleteLink(firestore, uid, link.helmRef);
      });
      return { ...report, state: 'off' };
    }
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
    if (isRateLimited(error)) return { ...report, state: 'rateLimited' };
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

const readPeople = async (firestore: Firestore) => {
  const snapshot = await firestore
    .collection('apps/helm/users')
    .where('calendarSync.accountId', '>', '')
    .limit(PEOPLE_MAX)
    .get();
  if (snapshot.size >= PEOPLE_MAX) logger.warn('helm.calendarSync.peopleLimit');
  return snapshot.docs.map((doc) => doc.id);
};

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
