/**
 * Throwaway spike for the bank-data provider. Never deployed and never imported by the app.
 *
 *   tsx scripts/runway/plaidSandbox.ts institutions
 *   tsx scripts/runway/plaidSandbox.ts flow [--webhook-url <https url>]
 *   tsx scripts/runway/plaidSandbox.ts verify <jwt from the Plaid-Verification header> <file holding the raw body>
 *
 * Reads RUNWAY_PLAID_CLIENT_ID, RUNWAY_PLAID_SECRET and RUNWAY_PLAID_ENV (sandbox unless set to production)
 * from the environment. `institutions` creates nothing, so it is safe with Trial keys; `flow` refuses to run
 * outside sandbox, since a Trial Item is never given back. Nothing prints a key, a secret or an access token.
 */
import {
  createHash,
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey,
} from 'node:crypto';
import { readFileSync } from 'node:fs';

const OWNER_INSTITUTIONS = [
  'Capital One',
  'Discover',
  'Citi',
  'Synchrony',
  'OnePay',
  'Wealthfront',
];
const SANDBOX_BANK = 'ins_109508';
const SYNC_TRIES = 8;
const SYNC_WAIT_MS = 4000;
const WEBHOOK_MAX_AGE_S = 5 * 60;

type PlaidEnv = 'sandbox' | 'production';

interface Credentials {
  clientId: string;
  secret: string;
  env: PlaidEnv;
}

function readCredentials(): Credentials {
  const clientId = process.env.RUNWAY_PLAID_CLIENT_ID ?? '';
  const secret = process.env.RUNWAY_PLAID_SECRET ?? '';
  if (!clientId || !secret) {
    throw new Error(
      'Set RUNWAY_PLAID_CLIENT_ID and RUNWAY_PLAID_SECRET in the environment first.',
    );
  }
  const env: PlaidEnv =
    process.env.RUNWAY_PLAID_ENV === 'production' ? 'production' : 'sandbox';
  return { clientId, secret, env };
}

async function call<T>(
  credentials: Credentials,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://${credentials.env}.plaid.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: credentials.clientId,
      secret: credentials.secret,
      ...body,
    }),
  });
  const json = (await response.json()) as T & {
    error_code?: string;
    error_message?: string;
  };
  if (!response.ok) {
    throw new Error(
      `${path}: ${json.error_code ?? response.status} ${json.error_message ?? ''}`.trim(),
    );
  }
  return json;
}

interface Institution {
  institution_id: string;
  name: string;
  products: string[];
  oauth: boolean;
}

async function listInstitutions(credentials: Credentials) {
  const found = await Promise.all(
    OWNER_INSTITUTIONS.map((query) =>
      call<{ institutions: Institution[] }>(
        credentials,
        '/institutions/search',
        {
          query,
          country_codes: ['US'],
          options: { include_optional_metadata: true },
        },
      ).then((result) => ({
        query,
        institutions: result.institutions.slice(0, 5),
      })),
    ),
  );
  found.forEach(({ query, institutions }) => {
    console.log(`\n${query} (${credentials.env})`);
    if (institutions.length === 0) console.log('  nothing found');
    institutions.forEach((institution) =>
      console.log(
        `  ${institution.name} [${institution.institution_id}] oauth=${institution.oauth} products=${institution.products.join(',')}`,
      ),
    );
  });
}

interface Account {
  account_id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: { current: number | null; available: number | null };
}

interface SyncPage {
  added: unknown[];
  modified: unknown[];
  removed: unknown[];
  next_cursor: string;
  has_more: boolean;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function syncAll(
  credentials: Credentials,
  accessToken: string,
  cursor: string | null,
): Promise<SyncPage> {
  const page = await call<SyncPage>(credentials, '/transactions/sync', {
    access_token: accessToken,
    ...(cursor ? { cursor } : {}),
  });
  if (!page.has_more) return page;
  const rest = await syncAll(credentials, accessToken, page.next_cursor);
  return {
    ...rest,
    added: [...page.added, ...rest.added],
    modified: [...page.modified, ...rest.modified],
    removed: [...page.removed, ...rest.removed],
  };
}

async function syncUntilReady(
  credentials: Credentials,
  accessToken: string,
  triesLeft: number,
): Promise<SyncPage> {
  const page = await syncAll(credentials, accessToken, null);
  if (page.added.length > 0 || triesLeft <= 1) return page;
  await wait(SYNC_WAIT_MS);
  return syncUntilReady(credentials, accessToken, triesLeft - 1);
}

async function runFlow(credentials: Credentials, webhookUrl: string | null) {
  if (credentials.env !== 'sandbox')
    throw new Error('flow runs in sandbox only.');
  const { public_token: publicToken } = await call<{ public_token: string }>(
    credentials,
    '/sandbox/public_token/create',
    {
      institution_id: SANDBOX_BANK,
      initial_products: ['transactions'],
      ...(webhookUrl ? { options: { webhook: webhookUrl } } : {}),
    },
  );
  console.log('1. Sandbox link: public token created');
  const { access_token: accessToken } = await call<{ access_token: string }>(
    credentials,
    '/item/public_token/exchange',
    { public_token: publicToken },
  );
  console.log('2. Exchanged for an access token (not printed)');
  const { accounts } = await call<{ accounts: Account[] }>(
    credentials,
    '/accounts/get',
    {
      access_token: accessToken,
    },
  );
  console.log(`3. Accounts: ${accounts.length}`);
  accounts.forEach((account) =>
    console.log(
      `   ${account.name} ••${account.mask ?? '----'} ${account.type}/${account.subtype ?? '-'}`,
    ),
  );
  const { accounts: balances } = await call<{ accounts: Account[] }>(
    credentials,
    '/accounts/balance/get',
    {
      access_token: accessToken,
    },
  );
  console.log('4. Balances read live:');
  balances.forEach((account) =>
    console.log(
      `   ••${account.mask ?? '----'} current=${account.balances.current} available=${account.balances.available}`,
    ),
  );
  const firstSync = await syncUntilReady(credentials, accessToken, SYNC_TRIES);
  console.log(
    `5. Cursor sync: added=${firstSync.added.length} modified=${firstSync.modified.length} removed=${firstSync.removed.length}`,
  );
  const nextSync = await syncAll(
    credentials,
    accessToken,
    firstSync.next_cursor,
  );
  console.log(
    `   Again from the saved cursor: added=${nextSync.added.length} (expect 0)`,
  );
  if (webhookUrl) {
    await call(credentials, '/sandbox/item/fire_webhook', {
      access_token: accessToken,
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
    });
    console.log(
      `6. Fired SYNC_UPDATES_AVAILABLE to ${webhookUrl}; verify it with the verify command`,
    );
  }
  await call(credentials, '/item/remove', { access_token: accessToken });
  console.log('Removed the sandbox Item.');
}

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

async function verifyWebhook(
  credentials: Credentials,
  jwt: string,
  bodyPath: string,
) {
  const [headerPart, payloadPart, signaturePart] = jwt.split('.');
  const header = decodePart(headerPart);
  if (header.alg !== 'ES256')
    throw new Error(`Refused: alg is ${String(header.alg)}, not ES256.`);
  const { key } = await call<{ key: JsonWebKey }>(
    credentials,
    '/webhook_verification_key/get',
    {
      key_id: header.kid,
    },
  );
  const isSigned = verifySignature(
    'sha256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    { key: createPublicKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
    Buffer.from(signaturePart, 'base64url'),
  );
  const payload = decodePart(payloadPart);
  const ageSeconds = Math.floor(Date.now() / 1000) - Number(payload.iat);
  const bodyHash = createHash('sha256')
    .update(readFileSync(bodyPath))
    .digest('hex');
  console.log(`signature valid: ${isSigned}`);
  console.log(`age: ${ageSeconds}s (refuse over ${WEBHOOK_MAX_AGE_S}s)`);
  console.log(
    `body hash matches request_body_sha256: ${bodyHash === payload.request_body_sha256}`,
  );
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const credentials = readCredentials();
  if (command === 'institutions') return listInstitutions(credentials);
  if (command === 'flow') {
    const urlIndex = rest.indexOf('--webhook-url');
    return runFlow(
      credentials,
      urlIndex >= 0 ? (rest[urlIndex + 1] ?? null) : null,
    );
  }
  if (command === 'verify' && rest.length === 2)
    return verifyWebhook(credentials, rest[0], rest[1]);
  throw new Error(
    'Usage: plaidSandbox.ts institutions | flow [--webhook-url <url>] | verify <jwt> <bodyFile>',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
