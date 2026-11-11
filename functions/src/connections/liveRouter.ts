import { createHash } from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { isGateOpenForUid } from '../gates/assertGateOpen.js';
import {
  SITE_ACCOUNT_ID,
  readConnectorAppId,
  toGrantId,
  type ConnectorId,
} from '../vendor/connectionsContract.js';
import { toDocumentLink, toMailLink, isLiveDeepLink } from './deepLinks.js';
import { GoogleHttpError } from './google/client.js';
import {
  findPassages,
  isDocumentRef,
  readDocument,
  searchDocuments,
  type DocumentKind,
} from './google/drive.js';
import { GOOGLE_DRIVE_MANIFEST } from './google/driveManifest.js';
import { isMailRef, readMail, searchMail } from './google/gmail.js';
import { GOOGLE_GMAIL_MANIFEST } from './google/gmailManifest.js';
import { readGrant } from './grants.js';
import {
  READER_APPS,
  SOURCE_ADAPTERS,
  type LiveQueryResult,
} from './registry.js';
import { ReconnectNeeded, getGoogleAccessToken } from './tokens.js';

export { isLiveDeepLink };

export interface LiveGrant {
  connectorId: 'google:gmail' | 'google:drive';
  accountId: string;
  email: string;
  label: string | null;
}

export interface LiveSearchItem {
  ref: string;
  kind: 'mail' | DocumentKind;
  title: string;
  from: string;
  at: number;
  snippet: string;
  deepLink: string;
}

export interface LiveReadItem {
  ref: string;
  kind: 'mail' | 'doc' | 'pdf';
  title: string;
  from: string;
  at: number;
  text: string;
  passages: string[];
  deepLink: string;
}

export type LiveFailure = {
  ok: false;
  reason: 'reconnect' | 'notGranted' | 'failed' | 'notReadable';
};

export interface LiveInput {
  uid: string;
  readerAppId: string;
  connectorId: string;
  accountId: string;
}

const LIVE_MANIFESTS = [GOOGLE_GMAIL_MANIFEST, GOOGLE_DRIVE_MANIFEST];
const CACHE_MS = 15 * 60_000;
const MAX_CACHED = 200;
const MAX_QUERY = 200;
const MAX_FIND = 100;
const MAX_READ_TEXT = 4000;
const KIND_LABELS: Record<DocumentKind, string> = {
  doc: 'Google Doc',
  pdf: 'PDF',
  other: 'Other file',
};
const NOT_GRANTED: LiveFailure = { ok: false, reason: 'notGranted' };

const cache = new Map<string, { expiresAt: number; value: unknown }>();

const isGateOpen = async (
  uid: string,
  readerAppId: string,
  connectorId: string,
) => {
  const gates = READER_APPS[readerAppId]?.restrictedGates ?? {};
  if (!Object.hasOwn(gates, connectorId)) return true;
  const { gateId, defaultRollout } = gates[connectorId];
  return isGateOpenForUid(uid, readerAppId, gateId, defaultRollout);
};

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
    .update(
      JSON.stringify([
        input.uid,
        input.connectorId,
        input.accountId,
        op,
        ...args,
      ]),
    )
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
  const [accounts, isOpen] = await Promise.all([
    Promise.all(
      grants.map((grant) =>
        firestore.doc(accountPath(uid, grant.accountId)).get(),
      ),
    ),
    Promise.all(
      grants.map((grant) => isGateOpen(uid, readerAppId, grant.connectorId)),
    ),
  ]);
  return grants.flatMap((grant, index): LiveGrant[] => {
    if (!isOpen[index]) return [];
    const email = accounts[index].get('email');
    const status = accounts[index].get('status');
    const label = accounts[index].get('label');
    return typeof email === 'string' &&
      (status === 'live' || status === 'needsReconnect') &&
      (grant.connectorId === 'google:gmail' ||
        grant.connectorId === 'google:drive')
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
  if (!(await isGateOpen(input.uid, input.readerAppId, input.connectorId))) {
    return NOT_GRANTED;
  }
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
    (error instanceof GoogleHttpError &&
      (error.status === 401 || error.status === 403));
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

/** Checks the grant, gets the account's token and runs one read that is never cached, for a read whose result must not be kept anywhere. */
export const withLiveAccess = async <T>(
  firestore: Firestore,
  input: LiveInput,
  read: (token: string, email: string) => Promise<T>,
): Promise<{ ok: true; value: T } | LiveFailure> => {
  const checked = await checkGrant(firestore, input);
  if (!checked.ok) return checked;
  try {
    const token = await getGoogleAccessToken(
      firestore,
      input.uid,
      input.accountId,
    );
    return { ok: true, value: await read(token, checked.email) };
  } catch (error) {
    return toFailure(error, 'access');
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
    async (token, email): Promise<LiveSearchItem[]> =>
      input.connectorId === 'google:drive'
        ? (await searchDocuments(token, email, query)).map((item) => ({
            ref: item.ref,
            kind: item.kind,
            title: item.title,
            from: KIND_LABELS[item.kind],
            at: item.at,
            snippet: '',
            deepLink: toDocumentLink(email, item.ref, item.kind),
          }))
        : (await searchMail(token, email, query)).map((item) => ({
            ref: item.ref,
            kind: 'mail',
            title: item.title,
            from: item.from,
            at: item.at,
            snippet: item.snippet,
            deepLink: toMailLink(email, item.ref),
          })),
  );
  return result.ok ? { ok: true, items: result.value } : result;
};

type ReadValue = LiveReadItem | 'notReadable';

/** Reads one message or document; `find` picks the passages of a document and is ignored for mail. */
export const readLive = async (
  firestore: Firestore,
  input: LiveInput & { ref: string; find?: string },
): Promise<{ ok: true; item: LiveReadItem } | LiveFailure> => {
  const isDrive = input.connectorId === 'google:drive';
  if (!(isDrive ? isDocumentRef(input.ref) : isMailRef(input.ref))) {
    return { ok: false, reason: 'failed' };
  }
  const find = isDrive ? (input.find ?? '').trim().slice(0, MAX_FIND) : '';
  const result = await run(
    firestore,
    input,
    'read',
    [input.ref, find],
    async (token, email): Promise<ReadValue> => {
      if (isDrive) {
        const item = await readDocument(token, email, input.ref);
        if (item.kind === 'other' || item.text === null) return 'notReadable';
        return {
          ref: item.ref,
          kind: item.kind,
          title: item.title,
          from: KIND_LABELS[item.kind],
          at: item.at,
          text: item.text.slice(0, MAX_READ_TEXT),
          passages: findPassages(item.text, find),
          deepLink: toDocumentLink(email, item.ref, item.kind),
        };
      }
      const item = await readMail(token, email, input.ref);
      return {
        ref: item.ref,
        kind: 'mail',
        title: item.title,
        from: item.from,
        at: item.at,
        text: item.text,
        passages: [],
        deepLink: toMailLink(email, item.ref),
      };
    },
  );
  if (!result.ok) return result;
  return result.value === 'notReadable'
    ? { ok: false, reason: 'notReadable' }
    : { ok: true, item: result.value };
};

export interface SiteLiveGrant {
  connectorId: string;
  categories: { id: string; label: string }[];
}

const siteLiveCategories = (connectorId: string) =>
  Object.hasOwn(SOURCE_ADAPTERS, connectorId) &&
  readConnectorAppId(connectorId) !== null &&
  SOURCE_ADAPTERS[connectorId].query
    ? SOURCE_ADAPTERS[connectorId].manifest.categories.filter(
        (category) => category.mode === 'live',
      )
    : [];

const siteGrantPath = (uid: string, readerAppId: string, connectorId: string) =>
  `connections/${uid}/grants/${toGrantId(
    readerAppId,
    connectorId as ConnectorId,
    SITE_ACCOUNT_ID,
  )}`;

export const listSiteLiveGrants = async (
  firestore: Firestore,
  uid: string,
  readerAppId: string,
): Promise<SiteLiveGrant[]> => {
  const connectorIds = Object.keys(SOURCE_ADAPTERS).filter(
    (id) => siteLiveCategories(id).length > 0,
  );
  const snapshots = await Promise.all(
    connectorIds.map((id) =>
      firestore.doc(siteGrantPath(uid, readerAppId, id)).get(),
    ),
  );
  return connectorIds.flatMap((connectorId, index): SiteLiveGrant[] => {
    if (!snapshots[index].exists) return [];
    const grant = readGrant(snapshots[index].data());
    const categories = siteLiveCategories(connectorId).filter(
      ({ id }) => grant.categories[id]?.isOn === true,
    );
    return grant.status === 'live' && categories.length > 0
      ? [{ connectorId, categories }]
      : [];
  });
};

export const querySiteLive = async (
  firestore: Firestore,
  input: {
    uid: string;
    readerAppId: string;
    connectorId: string;
    category: string;
    args: unknown;
  },
): Promise<{ ok: true; result: LiveQueryResult } | LiveFailure> => {
  const adapter = Object.hasOwn(SOURCE_ADAPTERS, input.connectorId)
    ? SOURCE_ADAPTERS[input.connectorId]
    : null;
  const isLiveCategory = siteLiveCategories(input.connectorId).some(
    ({ id }) => id === input.category,
  );
  if (!adapter?.query || !isLiveCategory) return NOT_GRANTED;
  try {
    const snapshot = await firestore
      .doc(siteGrantPath(input.uid, input.readerAppId, input.connectorId))
      .get();
    const grant = readGrant(snapshot.data());
    if (
      !snapshot.exists ||
      grant.status !== 'live' ||
      grant.categories[input.category]?.isOn !== true
    ) {
      return NOT_GRANTED;
    }
    const ctx = { uid: input.uid, accountId: SITE_ACCOUNT_ID, grant };
    if ((await adapter.status(ctx)) !== 'ok') return NOT_GRANTED;
    return {
      ok: true,
      result: await adapter.query(ctx, {
        category: input.category,
        args: input.args,
      }),
    };
  } catch (error) {
    logger.warn('connections.live.siteFailed', {
      connector: input.connectorId,
      code: error instanceof Error ? error.name : 'error',
    });
    return { ok: false, reason: 'failed' };
  }
};
