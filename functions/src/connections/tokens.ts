import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

import { gcmDecrypt, gcmEncrypt } from '../appKeys/gcm.js';
import { createKeyringLoader } from '../appKeys/loadKeyring.js';
import type { Keyring } from '../appKeys/keyring.js';
import { deriveSubkey } from './connectionKey.js';

export const CONNECTIONS_MASTER_KEYS = defineSecret('CONNECTIONS_MASTER_KEYS');
export const GOOGLE_OAUTH_CLIENT = defineSecret('GOOGLE_OAUTH_CLIENT');

/** Every callable that opens or writes an outside account's tokens binds these. */
export const GOOGLE_SECRETS = [CONNECTIONS_MASTER_KEYS, GOOGLE_OAUTH_CLIENT];

/** Validated on an instance's first call and again whenever the secret's text changes. */
export const loadConnectionsKeyring = createKeyringLoader(
  CONNECTIONS_MASTER_KEYS,
);

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const PURPOSE = 'oauth-refresh';
const EXPIRY_MARGIN_MS = 60_000;

const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

/** Thrown when the provider no longer honours the account's sign-in; the account and its grants then read as needing Reconnect. */
export class ReconnectNeeded extends Error {
  constructor() {
    super('The account needs to be reconnected.');
    this.name = 'ReconnectNeeded';
  }
}

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

/** The OAuth client from its secret; null only in the emulator when it is unset. */
export function readGoogleClient(): GoogleClient | null {
  const raw = (() => {
    try {
      return GOOGLE_OAUTH_CLIENT.value();
    } catch (error) {
      if (!isEmulator()) throw error;
      return '';
    }
  })();
  if (!raw && isEmulator()) return null;
  const parsed: unknown = JSON.parse(raw);
  const record =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  if (
    typeof record.clientId !== 'string' ||
    typeof record.clientSecret !== 'string' ||
    !record.clientId ||
    !record.clientSecret
  ) {
    throw new Error('The Google client is malformed.');
  }
  return { clientId: record.clientId, clientSecret: record.clientSecret };
}

const tokenRef = (firestore: Firestore, uid: string, accountId: string) =>
  firestore.doc(`connectionsServer/${uid}/tokens/${accountId}`);

const accountRef = (firestore: Firestore, uid: string, accountId: string) =>
  firestore.doc(`connections/${uid}/accounts/${accountId}`);

interface TokenDoc {
  masterKeyId: string | null;
  nonce: string | null;
  ciphertext: string | null;
  grantedScopes: string[];
  createdAt: number;
  lastRefreshedAt: number | null;
  isFixture: boolean;
}

const readTokenDoc = (data: Record<string, unknown>): TokenDoc => ({
  masterKeyId: typeof data.masterKeyId === 'string' ? data.masterKeyId : null,
  nonce: typeof data.nonce === 'string' ? data.nonce : null,
  ciphertext: typeof data.ciphertext === 'string' ? data.ciphertext : null,
  grantedScopes: Array.isArray(data.grantedScopes)
    ? data.grantedScopes.filter((s): s is string => typeof s === 'string')
    : [],
  createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
  lastRefreshedAt:
    typeof data.lastRefreshedAt === 'number' ? data.lastRefreshedAt : null,
  isFixture: data.isFixture === true,
});

const sealRefreshToken = (keyring: Keyring, uid: string, token: string) => {
  const masterKeyId = keyring.current;
  const { ciphertext, nonce } = gcmEncrypt(
    deriveSubkey(keyring, masterKeyId, PURPOSE),
    Buffer.from(token),
    Buffer.from(uid),
  );
  return { masterKeyId, ciphertext, nonce };
};

const openRefreshToken = (keyring: Keyring, uid: string, doc: TokenDoc) => {
  if (!doc.masterKeyId || !doc.ciphertext || !doc.nonce) {
    throw new Error('The stored token is incomplete.');
  }
  return gcmDecrypt(
    deriveSubkey(keyring, doc.masterKeyId, PURPOSE),
    doc.ciphertext,
    doc.nonce,
    Buffer.from(uid),
  ).toString('utf8');
};

/** Seals a refresh token for the account; with none given (Google sends one only on the first consent) the stored one stays. */
export async function storeRefreshToken(
  firestore: Firestore,
  uid: string,
  accountId: string,
  input: {
    refreshToken: string | null;
    grantedScopes: string[];
    now: number;
  },
) {
  const ref = tokenRef(firestore, uid, accountId);
  const keyring = loadConnectionsKeyring();
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists
      ? readTokenDoc(snapshot.data() ?? {})
      : null;
    const keeps = input.refreshToken === null ? existing : null;
    if (input.refreshToken === null && (!keeps || keeps.isFixture)) {
      throw new Error('No refresh token to keep.');
    }
    const sealed = input.refreshToken
      ? sealRefreshToken(keyring, uid, input.refreshToken)
      : {
          masterKeyId: keeps?.masterKeyId ?? null,
          ciphertext: keeps?.ciphertext ?? null,
          nonce: keeps?.nonce ?? null,
        };
    transaction.set(ref, {
      ...sealed,
      grantedScopes: input.grantedScopes,
      createdAt: existing?.createdAt || input.now,
      lastRefreshedAt: input.now,
    });
  });
}

/** Emulators only: a token document the fixture client answers, with nothing sealed. */
export async function storeFixtureToken(
  firestore: Firestore,
  uid: string,
  accountId: string,
  input: { grantedScopes: string[]; now: number },
) {
  await tokenRef(firestore, uid, accountId).set({
    isFixture: true,
    masterKeyId: null,
    nonce: null,
    ciphertext: null,
    grantedScopes: input.grantedScopes,
    createdAt: input.now,
    lastRefreshedAt: null,
  });
}

/** The account and every live grant on it read as needing Reconnect, together. */
async function markNeedsReconnect(
  firestore: Firestore,
  uid: string,
  accountId: string,
) {
  const account = accountRef(firestore, uid, accountId);
  const grants = firestore
    .collection(`connections/${uid}/grants`)
    .where('accountId', '==', accountId);
  await firestore.runTransaction(async (transaction) => {
    const [accountSnapshot, grantSnapshots] = await Promise.all([
      transaction.get(account),
      transaction.get(grants),
    ]);
    const now = Date.now();
    if (accountSnapshot.exists) {
      transaction.update(account, {
        status: 'needsReconnect',
        lastError: { code: 'invalid_grant', at: now },
      });
    }
    grantSnapshots.docs
      .filter((doc) => doc.data().status === 'live')
      .forEach((doc) =>
        transaction.update(doc.ref, {
          status: 'needsReconnect',
          updatedAt: now,
        }),
      );
  });
}

const cache = new Map<string, { token: string; expiresAt: number }>();

const toErrorCode = (value: unknown) =>
  typeof value === 'string' && /^[a-z_]{1,40}$/.test(value) ? value : 'unknown';

async function refreshAccessToken(refreshToken: string) {
  const client = readGoogleClient();
  if (!client) throw new Error('The Google client is not set.');
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (response.ok && typeof body.access_token === 'string') {
    const seconds = typeof body.expires_in === 'number' ? body.expires_in : 300;
    return { token: body.access_token, expiresInMs: seconds * 1000 };
  }
  return { code: toErrorCode(body.error), status: response.status };
}

/** A fresh access token for the account, opened and refreshed only inside this module. */
export const getGoogleAccessToken = async (
  firestore: Firestore,
  uid: string,
  accountId: string,
): Promise<string> => {
  const key = `${uid}/${accountId}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > now) return cached.token;

  const snapshot = await tokenRef(firestore, uid, accountId).get();
  if (!snapshot.exists) {
    await markNeedsReconnect(firestore, uid, accountId);
    throw new ReconnectNeeded();
  }
  const doc = readTokenDoc(snapshot.data() ?? {});
  if (isEmulator() && doc.isFixture) return 'fixture';

  const refreshToken = (() => {
    try {
      return openRefreshToken(loadConnectionsKeyring(), uid, doc);
    } catch {
      logger.error('connections.token.unsealFailed', {
        masterKeyId: doc.masterKeyId,
      });
      throw new Error('token-unseal-failed');
    }
  })();

  const result = await refreshAccessToken(refreshToken);
  if ('code' in result) {
    if (result.code === 'invalid_grant') {
      await markNeedsReconnect(firestore, uid, accountId);
      throw new ReconnectNeeded();
    }
    logger.warn('connections.token.refreshFailed', {
      code: result.code,
      status: result.status,
    });
    throw new Error(`token-refresh-${result.code}`);
  }
  cache.set(key, { token: result.token, expiresAt: now + result.expiresInMs });
  await tokenRef(firestore, uid, accountId)
    .update({ lastRefreshedAt: now })
    .catch(() => undefined);
  return result.token;
};

/** Best effort: asks Google to cancel the sign-in, then removes the sealed token and the account; a failed cancel never keeps either. */
export async function revokeGoogleAccount(
  firestore: Firestore,
  uid: string,
  accountId: string,
) {
  const ref = tokenRef(firestore, uid, accountId);
  const snapshot = await ref.get();
  const doc = snapshot.exists ? readTokenDoc(snapshot.data() ?? {}) : null;
  if (doc && !doc.isFixture) {
    try {
      const refreshToken = openRefreshToken(loadConnectionsKeyring(), uid, doc);
      const response = await fetch(GOOGLE_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      });
      if (!response.ok) {
        logger.warn('connections.token.revokeFailed', {
          code: 'status',
          status: response.status,
        });
      }
    } catch {
      logger.warn('connections.token.revokeFailed', { code: 'error' });
    }
  }
  cache.delete(`${uid}/${accountId}`);
  const batch = firestore.batch();
  batch.delete(ref);
  batch.delete(accountRef(firestore, uid, accountId));
  await batch.commit();
}
