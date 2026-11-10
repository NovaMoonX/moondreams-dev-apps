import { createHash, randomBytes } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  HttpsError,
  onCall,
  type CallableOptions,
} from 'firebase-functions/v2/https';
import { OAuth2Client } from 'google-auth-library';

import { canOpenApp } from '../../appAccess.js';
import {
  GOOGLE_ACCOUNT_PREFIX,
  isOutsideAccount,
  toGrantId,
  type ConnectionAccount,
  type ConnectorId,
  type FinishGoogleConnectionResult,
  type StartGoogleConnectionResult,
} from '../../vendor/connectionsContract.js';
import { requestedScopes } from '../grants.js';
import { READER_APPS, SOURCE_ADAPTERS } from '../registry.js';
import {
  GOOGLE_SECRETS,
  GOOGLE_TOKEN_URL,
  readGoogleClient,
  revokeRefreshTokenAtGoogle,
  storeFixtureToken,
  storeRefreshToken,
} from '../tokens.js';

if (getApps().length === 0) {
  initializeApp();
}

const OPTIONS: CallableOptions = {
  region: 'us-central1',
  maxInstances: 5,
  timeoutSeconds: 30,
  enforceAppCheck: true,
  secrets: GOOGLE_SECRETS,
  cors: [
    'https://apps.moondreams.dev',
    /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
  ],
};

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const STATE_TTL_MS = 10 * 60_000;
const MAX_OPEN_STATES = 10;
const MAX_TEXT_LENGTH = 2000;
const FIXTURE_CODE = 'fixture';
const IDENTITY_SCOPES = ['openid', 'email'];

const FIXTURE_ACCOUNTS = [
  { sub: 'fixture-personal', email: 'personal@example.com' },
  { sub: 'fixture-work', email: 'work@example.com' },
];

const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_TEXT_LENGTH;

const badRequest = () =>
  new HttpsError('invalid-argument', "That request wasn't understood.");

const toAccountId = (sub: string) =>
  GOOGLE_ACCOUNT_PREFIX +
  createHash('sha256').update(sub).digest('hex').slice(0, 16);

const toBase64Url = (value: Buffer) => value.toString('base64url');

const stateRef = (firestore: Firestore, uid: string, state: string) =>
  firestore.doc(`connectionsServer/${uid}/oauthStates/${state}`);

const accountRef = (firestore: Firestore, uid: string, accountId: string) =>
  firestore.doc(`connections/${uid}/accounts/${accountId}`);

const isAllowedOrigin = (origin: string) =>
  origin === 'https://apps.moondreams.dev' ||
  /^https:\/\/moondreams-dev-apps[^/]*\.web\.app$/.test(origin) ||
  (isEmulator() && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));

/** The redirect must be an origin of this site followed by exactly the reader's own path, so a code can only come back to the page that asked. */
const isAllowedRedirect = (redirectUri: string, readerPath: string) => {
  try {
    const url = new URL(redirectUri);
    return (
      isAllowedOrigin(url.origin) &&
      url.pathname === readerPath &&
      redirectUri === `${url.origin}${url.pathname}`
    );
  } catch {
    return false;
  }
};

const readStartRequest = (data: unknown) => {
  if (!isRecord(data)) throw badRequest();
  const { readerAppId, connectorId, redirectUri, accountId, isAnotherAccount } =
    data;
  if (
    !isText(readerAppId) ||
    !isText(connectorId) ||
    !isText(redirectUri) ||
    (accountId !== null && !isText(accountId)) ||
    typeof isAnotherAccount !== 'boolean'
  ) {
    throw badRequest();
  }
  return {
    readerAppId,
    connectorId: connectorId as ConnectorId,
    redirectUri,
    accountId,
    isAnotherAccount,
  };
};

const requireOutsideConnector = (readerAppId: string, connectorId: string) => {
  if (!Object.hasOwn(READER_APPS, readerAppId)) {
    throw new HttpsError(
      'invalid-argument',
      "That app can't read from other accounts.",
    );
  }
  if (!Object.hasOwn(SOURCE_ADAPTERS, connectorId)) {
    throw new HttpsError('invalid-argument', "That source isn't available.");
  }
  const { manifest } = SOURCE_ADAPTERS[connectorId];
  if (manifest.connect.kind !== 'oauth') {
    throw new HttpsError('invalid-argument', "That source isn't available.");
  }
  if (manifest.connect.isRestricted) {
    throw new HttpsError('failed-precondition', "That source isn't open yet.");
  }
  return manifest;
};

const readLoginHint = async (
  firestore: Firestore,
  uid: string,
  accountId: string | null,
) => {
  if (accountId === null) return null;
  if (!isOutsideAccount(accountId)) throw badRequest();
  const snapshot = await accountRef(firestore, uid, accountId).get();
  const email = snapshot.data()?.email;
  if (!snapshot.exists || typeof email !== 'string') {
    throw new HttpsError('not-found', "That account doesn't exist.");
  }
  return email;
};

export const startGoogleConnection = onCall(OPTIONS, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in to connect.');
  const req = readStartRequest(request.data);
  const manifest = requireOutsideConnector(req.readerAppId, req.connectorId);

  const firestore = getFirestore();
  if (!(await canOpenApp(firestore, req.readerAppId, auth))) {
    throw new HttpsError('permission-denied', "You can't open that app.");
  }
  const readerPath = new URL(
    READER_APPS[req.readerAppId].grantPagePath('x'),
    'https://site.invalid',
  ).pathname;
  if (!isAllowedRedirect(req.redirectUri, readerPath)) {
    throw badRequest();
  }

  const loginHint = await readLoginHint(firestore, auth.uid, req.accountId);

  const now = Date.now();
  const open = await firestore
    .collection(`connectionsServer/${auth.uid}/oauthStates`)
    .where('expiresAt', '>', now)
    .limit(MAX_OPEN_STATES)
    .get();
  if (open.size >= MAX_OPEN_STATES) {
    throw new HttpsError(
      'resource-exhausted',
      'Too many sign-ins are open. Wait a few minutes and try again.',
    );
  }
  const state = randomBytes(32).toString('hex');
  const codeVerifier = toBase64Url(randomBytes(32));
  await stateRef(firestore, auth.uid, state).create({
    readerAppId: req.readerAppId,
    connectorId: req.connectorId,
    redirectUri: req.redirectUri,
    codeVerifier,
    accountId: req.accountId,
    createdAt: now,
    expiresAt: now + STATE_TTL_MS,
  });

  const client = readGoogleClient();
  if (!client) {
    const result: StartGoogleConnectionResult = {
      authUrl: `${req.redirectUri}?code=${FIXTURE_CODE}&state=${state}`,
      state,
    };
    return result;
  }
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: req.redirectUri,
    response_type: 'code',
    scope: [...IDENTITY_SCOPES, ...requestedScopes(manifest)].join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: req.isAnotherAccount ? 'select_account consent' : 'consent',
    state,
    code_challenge: toBase64Url(
      createHash('sha256').update(codeVerifier).digest(),
    ),
    code_challenge_method: 'S256',
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  const result: StartGoogleConnectionResult = {
    authUrl: `${AUTH_URL}?${params.toString()}`,
    state,
  };
  return result;
});

const readFinishRequest = (data: unknown) => {
  if (
    !isRecord(data) ||
    !isText(data.code) ||
    typeof data.state !== 'string' ||
    !/^[0-9a-f]{64}$/.test(data.state)
  ) {
    throw badRequest();
  }
  return { code: data.code, state: data.state };
};

interface StoredState {
  readerAppId: string;
  connectorId: ConnectorId;
  redirectUri: string;
  codeVerifier: string;
  accountId: string | null;
  expiresAt: number;
}

const readState = (data: Record<string, unknown>): StoredState => ({
  readerAppId: String(data.readerAppId),
  connectorId: String(data.connectorId) as ConnectorId,
  redirectUri: String(data.redirectUri),
  codeVerifier: String(data.codeVerifier),
  accountId: typeof data.accountId === 'string' ? data.accountId : null,
  expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : 0,
});

/** Reads and deletes in one transaction, so a state opens one finish and no more. */
const consumeState = (firestore: Firestore, uid: string, state: string) =>
  firestore.runTransaction(async (transaction) => {
    const ref = stateRef(firestore, uid, state);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    transaction.delete(ref);
    return readState(snapshot.data() ?? {});
  });

const toErrorCode = (value: unknown) =>
  typeof value === 'string' && /^[a-z_]{1,40}$/.test(value) ? value : 'unknown';

interface Identity {
  sub: string;
  /** Null when Google doesn't vouch for the address. */
  email: string | null;
  refreshToken: string | null;
  grantedScopes: string[];
}

async function exchangeCode(
  code: string,
  state: StoredState,
): Promise<Identity> {
  const client = readGoogleClient();
  if (!client) throw new Error('The Google client is not set.');
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: state.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: state.codeVerifier,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok || typeof body.id_token !== 'string') {
    logger.warn('connections.oauth.exchangeFailed', {
      code: toErrorCode(body.error),
      status: response.status,
    });
    throw new HttpsError(
      'failed-precondition',
      "Google didn't accept that sign-in. Try again.",
    );
  }
  const ticket = await new OAuth2Client(client.clientId)
    .verifyIdToken({ idToken: body.id_token, audience: client.clientId })
    .catch(() => {
      logger.warn('connections.oauth.idTokenInvalid');
      throw new HttpsError(
        'failed-precondition',
        "Google didn't accept that sign-in. Try again.",
      );
    });
  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new HttpsError(
      'failed-precondition',
      "Google didn't share which account that is.",
    );
  }
  return {
    sub: payload.sub,
    email:
      payload.email && payload.email_verified === true ? payload.email : null,
    refreshToken:
      typeof body.refresh_token === 'string' ? body.refresh_token : null,
    grantedScopes:
      typeof body.scope === 'string'
        ? body.scope.split(' ').filter(Boolean)
        : [],
  };
}

/** The first fixture account this person has not connected, or the one being reconnected. */
async function pickFixtureIdentity(
  firestore: Firestore,
  uid: string,
  state: StoredState,
  scopes: string[],
): Promise<Identity> {
  const snapshots = await Promise.all(
    FIXTURE_ACCOUNTS.map((fixture) =>
      accountRef(firestore, uid, toAccountId(fixture.sub)).get(),
    ),
  );
  const reconnecting = FIXTURE_ACCOUNTS.find(
    (fixture) => toAccountId(fixture.sub) === state.accountId,
  );
  const free = FIXTURE_ACCOUNTS.find((_, index) => !snapshots[index].exists);
  const chosen = reconnecting ?? free;
  if (!chosen) {
    throw new HttpsError(
      'failed-precondition',
      'Every test account is already connected.',
    );
  }
  return {
    ...chosen,
    refreshToken: null,
    grantedScopes: [...IDENTITY_SCOPES, ...scopes],
  };
}

export const finishGoogleConnection = onCall(OPTIONS, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in to connect.');
  const req = readFinishRequest(request.data);
  const firestore = getFirestore();

  const state = await consumeState(firestore, auth.uid, req.state);
  if (!state || state.expiresAt < Date.now()) {
    throw new HttpsError(
      'failed-precondition',
      'That sign-in expired. Start again.',
    );
  }
  const manifest = requireOutsideConnector(
    state.readerAppId,
    state.connectorId,
  );
  const scopes = requestedScopes(manifest);
  const isFixture = isEmulator() && req.code === FIXTURE_CODE;
  const identity = isFixture
    ? await pickFixtureIdentity(firestore, auth.uid, state, scopes)
    : await exchangeCode(req.code, state);

  const accountId = toAccountId(identity.sub);
  const refuse = async (error: HttpsError) => {
    if (identity.refreshToken !== null && !isFixture) {
      const known = await accountRef(firestore, auth.uid, accountId).get();
      if (!known.exists)
        await revokeRefreshTokenAtGoogle(identity.refreshToken);
    }
    throw error;
  };
  if (state.accountId !== null && state.accountId !== accountId) {
    return refuse(
      new HttpsError(
        'failed-precondition',
        'That is a different Google account. Sign in with the one you are reconnecting.',
      ),
    );
  }
  if (!scopes.every((scope) => identity.grantedScopes.includes(scope))) {
    return refuse(
      new HttpsError(
        'permission-denied',
        "Nothing was connected: the permission it needs wasn't granted.",
      ),
    );
  }
  const knownEmail = (
    await accountRef(firestore, auth.uid, accountId).get()
  ).get('email');
  const email =
    identity.email ?? (typeof knownEmail === 'string' ? knownEmail : null);
  if (email === null) {
    return refuse(
      new HttpsError(
        'failed-precondition',
        "Google didn't confirm that account's email address.",
      ),
    );
  }

  const now = Date.now();
  if (isFixture) {
    await storeFixtureToken(firestore, auth.uid, accountId, {
      grantedScopes: identity.grantedScopes,
      now,
    });
  } else {
    await storeRefreshToken(firestore, auth.uid, accountId, {
      refreshToken: identity.refreshToken,
      grantedScopes: identity.grantedScopes,
      now,
    }).catch(() => {
      logger.error('connections.oauth.storeFailed');
      throw new HttpsError(
        'failed-precondition',
        "Google didn't let this stay connected. Try again.",
      );
    });
  }

  const account = accountRef(firestore, auth.uid, accountId);
  await firestore.runTransaction(async (transaction) => {
    const existing = (await transaction.get(account)).data();
    const next: ConnectionAccount = {
      provider: 'google',
      email,
      label: typeof existing?.label === 'string' ? existing.label : null,
      grantedScopes: identity.grantedScopes,
      status: 'live',
      connectedAt:
        typeof existing?.connectedAt === 'number' ? existing.connectedAt : now,
      lastError: null,
    };
    transaction.set(account, next);
  });

  const hasLiveGrant = await reviveGrants(firestore, auth.uid, accountId, {
    grantId: toGrantId(state.readerAppId, state.connectorId, accountId),
  });
  const result: FinishGoogleConnectionResult = {
    accountId,
    email,
    readerAppId: state.readerAppId,
    connectorId: state.connectorId,
    hasLiveGrant,
  };
  return result;
});

/** Grants held back by a lapsed sign-in go live again; returns whether the named grant is not ended. */
const reviveGrants = (
  firestore: Firestore,
  uid: string,
  accountId: string,
  target: { grantId: string },
) =>
  firestore.runTransaction(async (transaction) => {
    const snapshots = await transaction.get(
      firestore
        .collection(`connections/${uid}/grants`)
        .where('accountId', '==', accountId),
    );
    const now = Date.now();
    snapshots.docs
      .filter((doc) => doc.data().status === 'needsReconnect')
      .forEach((doc) =>
        transaction.update(doc.ref, { status: 'live', updatedAt: now }),
      );
    return snapshots.docs.some(
      (doc) => doc.id === target.grantId && doc.data().status !== 'ended',
    );
  });
