import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import {
  GoogleHttpError,
  googleGet,
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
  CALENDAR_ID_SCOPE_APP_CREATED,
  CALENDAR_ID_SCOPE_EVENTS,
  deleteLink,
  readGrantState,
  readLinks,
  releaseLease,
  takeLease,
  toCalendarGrantId,
  userPath,
  writeActivity,
} from './calendarSyncStore.js';
import { toWindow } from './plan.js';

if (getApps().length === 0) {
  initializeApp();
}

const LEASE_MS = 2 * 60_000;
const MAX_ID_LENGTH = 300;

export type SetHelmCalendarSyncRequest =
  | { action: 'make'; accountId: string }
  | { action: 'choose'; accountId: string; calendarId: string }
  | { action: 'stop' };

export interface SetHelmCalendarSyncResult {
  calendarName: string | null;
  /** Upcoming events taken off the calendar on Stop. */
  removedCount: number;
  /** Upcoming events Stop could not take off (the account needs reconnecting). */
  leftCount: number;
}

interface CalendarEntry {
  id: string;
  summary?: string;
  summaryOverride?: string;
  accessRole?: string;
}

const badRequest = () =>
  new HttpsError('invalid-argument', "That request wasn't understood.");

const isId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_ID_LENGTH &&
  !value.includes('/');

const readRequest = (data: unknown): SetHelmCalendarSyncRequest => {
  if (typeof data !== 'object' || data === null) throw badRequest();
  const { action, accountId, calendarId } = data as Record<string, unknown>;
  if (action === 'stop') return { action };
  if (action === 'make' && isId(accountId)) return { action, accountId };
  if (action === 'choose' && isId(accountId) && isId(calendarId))
    return { action, accountId, calendarId };
  throw badRequest();
};

const needsScope = (scope: string) =>
  new HttpsError(
    'failed-precondition',
    'Allow calendar access to keep your plan there.',
    { reason: 'needsScope', code: 'needsScope', scope },
  );

const reconnect = () =>
  new HttpsError('failed-precondition', 'Reconnect this account to continue.', {
    reason: 'reconnect',
  });

const isStatus = (error: unknown, ...statuses: number[]) =>
  error instanceof GoogleHttpError && statuses.includes(error.status);

const readScopes = async (
  firestore: Firestore,
  uid: string,
  accountId: string,
) => {
  const account = await firestore
    .doc(`connections/${uid}/accounts/${accountId}`)
    .get();
  if (!account.exists || account.get('status') !== 'live') throw reconnect();
  const scopes: unknown = account.get('grantedScopes');
  return {
    scopes: Array.isArray(scopes) ? (scopes as string[]) : [],
    email:
      typeof account.get('email') === 'string'
        ? (account.get('email') as string)
        : null,
  };
};

/** Sets or clears the one Google calendar the plan is kept in step with. */
export async function setCalendarSync(
  firestore: Firestore,
  uid: string,
  request: SetHelmCalendarSyncRequest,
  now: number,
): Promise<SetHelmCalendarSyncResult> {
  const profileRef = firestore.doc(userPath(uid));
  const profile = (await profileRef.get()).data();
  if (!profile) throw new HttpsError('not-found', 'Open the app first.');
  const key = await unwrapHelmKey(firestore, loadHelmKeyring(), uid);
  const timeZone = String(profile.timeZone ?? 'UTC');

  if (request.action === 'stop') {
    return stop(firestore, uid, profile, key, timeZone, now);
  }
  if (profile.calendarSync) {
    throw new HttpsError(
      'failed-precondition',
      'Your plan is already kept in a calendar. Stop that first.',
      { reason: 'alreadyOn' },
    );
  }
  const { accountId } = request;
  const { scopes, email } = await readScopes(firestore, uid, accountId);
  const grant = await readGrantState(firestore, uid, accountId);
  if (!grant || !grant.isLive)
    throw new HttpsError(
      'failed-precondition',
      'Connect that calendar account first.',
      { reason: 'noGrant' },
    );
  const needed =
    request.action === 'make'
      ? CALENDAR_ID_SCOPE_APP_CREATED
      : CALENDAR_ID_SCOPE_EVENTS;
  if (!scopes.includes(needed)) throw needsScope(needed);

  const token = await getGoogleAccessToken(firestore, uid, accountId).catch(
    (error: unknown) => {
      throw error instanceof ReconnectNeeded ? reconnect() : error;
    },
  );
  const assistant =
    readAssistantName(profile.assistantName) ?? DEFAULT_ASSISTANT_NAME;
  const chosen =
    request.action === 'make'
      ? await makeCalendar(token, `${assistant}'s plan`, timeZone)
      : await readWritable(token, request.calendarId, email);
  const wasAlreadyRead = grant.calendarIds.includes(chosen.id);
  await firestore.runTransaction(async (transaction) => {
    const grantRef = firestore.doc(
      `connections/${uid}/grants/${toCalendarGrantId(accountId)}`,
    );
    const current = await transaction.get(grantRef);
    const ids: unknown = current.get('options.calendarIds');
    const known = Array.isArray(ids) ? (ids as string[]) : [];
    transaction.update(grantRef, {
      options: {
        calendarIds: known.includes(chosen.id) ? known : [...known, chosen.id],
      },
      updatedAt: now,
    });
    transaction.update(profileRef, {
      calendarSync: {
        accountId,
        calendarId: chosen.id,
        calendarName: chosen.name,
        isMadeByHelm: request.action === 'make',
        wasAlreadyRead,
        startedAt: now,
        lastWrittenAt: null,
        lastError: null,
      },
    });
  });
  await writeActivity(
    firestore,
    uid,
    key,
    `Started keeping your plan in step with ${chosen.name}`,
    now,
    false,
  );
  return { calendarName: chosen.name, removedCount: 0, leftCount: 0 };
}

const makeCalendar = async (
  token: string,
  summary: string,
  timeZone: string,
) => {
  const made = await googleSend<{ id?: string; summary?: string }>(
    token,
    'POST',
    `${CALENDAR_API}/calendars`,
    { summary, timeZone },
  ).catch(toReconnectOnRefusal);
  if (typeof made?.id !== 'string')
    throw new HttpsError(
      'unavailable',
      "Couldn't make the calendar. Try again.",
    );
  return { id: made.id, name: made.summary ?? summary };
};

const readWritable = async (
  token: string,
  calendarId: string,
  email: string | null,
) => {
  const params = new URLSearchParams({
    maxResults: '250',
    fields: 'items(id,summary,summaryOverride,accessRole)',
  });
  const list = await googleGet<{ items?: CalendarEntry[] }>(
    token,
    `${CALENDAR_API}/users/me/calendarList?${params}`,
    { email },
  ).catch(toReconnectOnRefusal);
  const entry = (list.items ?? []).find((item) => item.id === calendarId);
  if (!entry)
    throw new HttpsError('not-found', "That calendar isn't in this account.");
  if (entry.accessRole !== 'owner' && entry.accessRole !== 'writer')
    throw new HttpsError(
      'failed-precondition',
      "You can only read that calendar, so your plan can't be kept there.",
      { reason: 'readOnly' },
    );
  return {
    id: entry.id,
    name: entry.summaryOverride ?? entry.summary ?? entry.id,
  };
};

const stop = async (
  firestore: Firestore,
  uid: string,
  profile: Record<string, unknown>,
  key: Awaited<ReturnType<typeof unwrapHelmKey>>,
  timeZone: string,
  now: number,
): Promise<SetHelmCalendarSyncResult> => {
  const sync = profile.calendarSync as {
    accountId: string;
    calendarId: string;
    calendarName: string;
    isMadeByHelm: boolean;
    wasAlreadyRead: boolean;
  } | null;
  if (!sync) return { calendarName: null, removedCount: 0, leftCount: 0 };
  if (!(await takeLease(firestore, uid, now, LEASE_MS)))
    throw new HttpsError(
      'aborted',
      'Your plan is being updated. Try again in a moment.',
    );
  try {
    const { startAt } = toWindow(now, timeZone);
    const links = [...(await readLinks(firestore, uid)).values()];
    const upcoming = links.filter(
      (link) =>
        link.removedAt === null &&
        link.calendarId === sync.calendarId &&
        link.startAt >= startAt,
    );
    const token = await getGoogleAccessToken(
      firestore,
      uid,
      sync.accountId,
    ).catch((error: unknown) => {
      if (error instanceof ReconnectNeeded) return null;
      throw error;
    });
    const removed =
      token === null
        ? []
        : await Promise.all(
            upcoming.map((link) =>
              googleSend(
                token,
                'DELETE',
                `${CALENDAR_API}/calendars/${encodeURIComponent(sync.calendarId)}/events/${encodeURIComponent(link.eventId)}`,
              ).then(
                () => true,
                (error: unknown) => isStatus(error, 404, 410),
              ),
            ),
          );
    const removedCount = removed.filter(Boolean).length;
    await Promise.all(
      links.map((link) => deleteLink(firestore, uid, link.helmRef)),
    );
    await firestore.runTransaction(async (transaction) => {
      const grantRef = firestore.doc(
        `connections/${uid}/grants/${toCalendarGrantId(sync.accountId)}`,
      );
      const grant = await transaction.get(grantRef);
      const ids: unknown = grant.get('options.calendarIds');
      const known = Array.isArray(ids) ? (ids as string[]) : [];
      const kept =
        sync.wasAlreadyRead && !sync.isMadeByHelm
          ? known
          : known.filter((id) => id !== sync.calendarId);
      if (grant.exists && kept.length !== known.length)
        transaction.update(grantRef, {
          options: kept.length === 0 ? null : { calendarIds: kept },
          updatedAt: now,
        });
      transaction.update(firestore.doc(userPath(uid)), { calendarSync: null });
    });
    await writeActivity(
      firestore,
      uid,
      key,
      `Stopped keeping your plan in step with ${sync.calendarName}`,
      now,
      false,
    );
    logger.info('helm.calendarSync.stopped', { removedCount });
    return {
      calendarName: sync.calendarName,
      removedCount,
      leftCount: upcoming.length - removedCount,
    };
  } finally {
    await releaseLease(firestore, uid);
  }
};

export const setHelmCalendarSync = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 60,
    enforceAppCheck: true,
    secrets: [HELM_MASTER_KEYS, ...GOOGLE_SECRETS],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<SetHelmCalendarSyncResult> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
    return setCalendarSync(
      getFirestore(),
      uid,
      readRequest(request.data),
      Date.now(),
    );
  },
);

export default setHelmCalendarSync;
