import { createHash } from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { toGrantId, type ConnectorId } from '../vendor/connectionsContract.js';
import { toMailLink, isLiveDeepLink } from './deepLinks.js';
import { GoogleHttpError } from './google/client.js';
import { isMailRef, readMail, searchMail } from './google/gmail.js';
import { GOOGLE_GMAIL_MANIFEST } from './google/gmailManifest.js';
import { readGrant } from './grants.js';
import { ReconnectNeeded, getGoogleAccessToken } from './tokens.js';

export { isLiveDeepLink };

export interface LiveGrant {
  connectorId: 'google:gmail';
  accountId: string;
  email: string;
  label: string | null;
}

export interface LiveSearchItem {
  ref: string;
  title: string;
  from: string;
  at: number;
  snippet: string;
  deepLink: string;
}

export interface LiveReadItem {
  ref: string;
  title: string;
  from: string;
  at: number;
  text: string;
  deepLink: string;
}

export type LiveFailure = {
  ok: false;
  reason: 'reconnect' | 'notGranted' | 'failed';
};

interface LiveInput {
  uid: string;
  readerAppId: string;
  connectorId: string;
  accountId: string;
}

const LIVE_MANIFESTS = [GOOGLE_GMAIL_MANIFEST];
const CACHE_MS = 15 * 60_000;
const MAX_CACHED = 200;
const MAX_QUERY = 200;
const NOT_GRANTED: LiveFailure = { ok: false, reason: 'notGranted' };

const cache = new Map<string, { expiresAt: number; value: unknown }>();

const liveManifest = (connectorId: string) =>
  LIVE_MANIFESTS.find((manifest) => manifest.id === connectorId);

const liveCategoryIds = (connectorId: string) =>
  (liveManifest(connectorId)?.categories ?? [])
    .filter((category) => category.mode === 'live')
    .map((category) => category.id);

const accountPath = (uid: string, accountId: string) =>
  `connections/${uid}/accounts/${accountId}`;

const toCacheKey = (input: LiveInput, op: string, args: unknown[]) =>
  createHash('sha256')
    .update(JSON.stringify([input.uid, input.accountId, op, ...args]))
    .digest('hex');

const remember = (key: string, value: unknown, now: number) => {
  cache.delete(key);
  cache.set(key, { expiresAt: now + CACHE_MS, value });
  Array.from(cache.keys())
    .slice(0, Math.max(0, cache.size - MAX_CACHED))
    .forEach((old) => cache.delete(old));
};

/** The person's live grants a reader app holds, with a live category on and an account that is signed in or needs Reconnect. */
export const listLiveGrants = async (
  firestore: Firestore,
  uid: string,
  readerAppId: string,
): Promise<LiveGrant[]> => {
  const snapshots = await firestore
    .collection(`connections/${uid}/grants`)
    .where('readerAppId', '==', readerAppId)
    .get();
  const grants = snapshots.docs
    .map((doc) => readGrant(doc.data()))
    .filter(
      (grant) =>
        (grant.status === 'live' || grant.status === 'needsReconnect') &&
        liveCategoryIds(grant.connectorId).some(
          (id) => grant.categories[id]?.isOn === true,
        ),
    );
  const accounts = await Promise.all(
    grants.map((grant) =>
      firestore.doc(accountPath(uid, grant.accountId)).get(),
    ),
  );
  return grants.flatMap((grant, index): LiveGrant[] => {
    const email = accounts[index].get('email');
    const status = accounts[index].get('status');
    const label = accounts[index].get('label');
    return typeof email === 'string' &&
      (status === 'live' || status === 'needsReconnect') &&
      grant.connectorId === 'google:gmail'
      ? [
          {
            connectorId: grant.connectorId,
            accountId: grant.accountId,
            email,
            label: typeof label === 'string' ? label : null,
          },
        ]
      : [];
  });
};

/** The account's email when the grant is live, not ended and has a live category on; otherwise a refusal. */
const checkGrant = async (firestore: Firestore, input: LiveInput) => {
  if (!liveManifest(input.connectorId)) return NOT_GRANTED;
  const [grantSnapshot, account] = await Promise.all([
    firestore
      .doc(
        `connections/${input.uid}/grants/${toGrantId(
          input.readerAppId,
          input.connectorId as ConnectorId,
          input.accountId,
        )}`,
      )
      .get(),
    firestore.doc(accountPath(input.uid, input.accountId)).get(),
  ]);
  const grant = readGrant(grantSnapshot.data());
  const email = account.get('email');
  if (
    !grantSnapshot.exists ||
    grant.status === 'ended' ||
    grant.status === 'noAccess' ||
    !liveCategoryIds(input.connectorId).some(
      (id) => grant.categories[id]?.isOn === true,
    ) ||
    typeof email !== 'string'
  ) {
    return NOT_GRANTED;
  }
  const isStale =
    grant.status === 'needsReconnect' ||
    account.get('status') === 'needsReconnect';
  return isStale
    ? ({ ok: false, reason: 'reconnect' } satisfies LiveFailure)
    : { ok: true as const, email };
};

const toFailure = (error: unknown, op: string): LiveFailure => {
  const isReconnect =
    error instanceof ReconnectNeeded ||
    (error instanceof GoogleHttpError && error.status === 401);
  logger.warn('connections.live.failed', {
    op,
    code: error instanceof GoogleHttpError ? error.code : 'error',
    isReconnect,
  });
  return { ok: false, reason: isReconnect ? 'reconnect' : 'failed' };
};

const run = async <T>(
  firestore: Firestore,
  input: LiveInput,
  op: string,
  args: string[],
  read: (token: string, email: string) => Promise<T>,
): Promise<{ ok: true; value: T } | LiveFailure> => {
  const checked = await checkGrant(firestore, input);
  if (!checked.ok) return checked;
  const key = toCacheKey(input, op, args);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return { ok: true, value: hit.value as T };
  try {
    const token = await getGoogleAccessToken(
      firestore,
      input.uid,
      input.accountId,
    );
    const value = await read(token, checked.email);
    remember(key, value, now);
    return { ok: true, value };
  } catch (error) {
    return toFailure(error, op);
  }
};

export const searchLive = async (
  firestore: Firestore,
  input: LiveInput & { query: string },
): Promise<{ ok: true; items: LiveSearchItem[] } | LiveFailure> => {
  const query = input.query.trim().slice(0, MAX_QUERY);
  if (query === '') return { ok: false, reason: 'failed' };
  const result = await run(
    firestore,
    input,
    'search',
    [query],
    async (token, email) =>
      (await searchMail(token, email, query)).map((item) => ({
        ref: item.ref,
        title: item.title,
        from: item.from,
        at: item.at,
        snippet: item.snippet,
        deepLink: toMailLink(email, item.ref),
      })),
  );
  return result.ok ? { ok: true, items: result.value } : result;
};

export const readLive = async (
  firestore: Firestore,
  input: LiveInput & { ref: string },
): Promise<{ ok: true; item: LiveReadItem } | LiveFailure> => {
  if (!isMailRef(input.ref)) return { ok: false, reason: 'failed' };
  const result = await run(
    firestore,
    input,
    'read',
    [input.ref],
    async (token, email): Promise<LiveReadItem> => {
      const item = await readMail(token, email, input.ref);
      return {
        ref: item.ref,
        title: item.title,
        from: item.from,
        at: item.at,
        text: item.text,
        deepLink: toMailLink(email, item.ref),
      };
    },
  );
  return result.ok ? { ok: true, item: result.value } : result;
};
