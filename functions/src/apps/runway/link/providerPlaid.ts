import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

import {
  normalizeAccount,
  normalizeCardStatement,
  normalizeTransaction,
  toBankName,
  toHttpsUrl,
  type RawAccount,
} from './normalize.js';
import {
  asProviderCode,
  ProviderError,
  type BankDataProvider,
  type CardStatementRead,
  type NormalizedTransaction,
  type ProviderGrant,
  type TransactionDetails,
  type ProviderInstitution,
  type TransactionSync,
} from './provider.js';

export const PLAID_CLIENT_ID = defineSecret('RUNWAY_PLAID_CLIENT_ID');
export const PLAID_SECRET = defineSecret('RUNWAY_PLAID_SECRET');
export const PROVIDER_SECRETS = [PLAID_CLIENT_ID, PLAID_SECRET];

const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';
const host = () =>
  isEmulator() ? 'https://sandbox.plaid.com' : 'https://production.plaid.com';

/** How far back the first sync reaches. */
const LINK_DAYS_REQUESTED = 30;
const SYNC_PAGE_SIZE = 500;
const MAX_PAGES_PER_CALL = 10;
const MAX_LOGO_PAGES = 20;

const webhookUrl = () =>
  `https://us-central1-${process.env.GCLOUD_PROJECT ?? 'moondreams-dev-apps'}.cloudfunctions.net/runwayPlaidWebhook`;

const readSecret = (secret: { value(): string }) => {
  try {
    return secret.value();
  } catch {
    return '';
  }
};

/** True when both secrets hold a value, so a caller that can skip the provider knows to. */
export const hasProviderSecrets = () =>
  readSecret(PLAID_CLIENT_ID) !== '' && readSecret(PLAID_SECRET) !== '';

interface PlaidFailure {
  error_code?: string;
  error_message?: string;
}

/** Codes only the person can fix at their bank, so the link waits for a reconnect instead of retrying. */
const NEEDS_PERSON_CODES = new Set([
  'ITEM_LOGIN_REQUIRED',
  'INVALID_CREDENTIALS',
  'INVALID_MFA',
  'ITEM_LOCKED',
  'USER_SETUP_REQUIRED',
  'ACCESS_NOT_GRANTED',
  'INSUFFICIENT_CREDENTIALS',
]);

function toProviderError(code: string): ProviderError {
  if (code === 'NO_ACCOUNTS') {
    return new ProviderError(
      'needsAttention',
      'Your bank is not sharing any accounts. Connect again and pick at least one.',
      asProviderCode(code),
    );
  }
  if (code === 'ITEM_NOT_FOUND' || code === 'INVALID_ACCESS_TOKEN') {
    return new ProviderError(
      'needsAttention',
      'This bank connection is no longer valid. Remove it and link your bank again.',
      asProviderCode(code),
    );
  }
  if (NEEDS_PERSON_CODES.has(code)) {
    return new ProviderError(
      'needsAttention',
      'Your bank needs you to sign in again.',
      asProviderCode(code),
    );
  }
  if (code === 'INVALID_PUBLIC_TOKEN' || code === 'INVALID_LINK_TOKEN') {
    return new ProviderError(
      'rejected',
      'That bank sign-in expired. Start again.',
      asProviderCode(code),
    );
  }
  if (
    code === 'RATE_LIMIT_EXCEEDED' ||
    code === 'INSTITUTION_DOWN' ||
    code === 'INSTITUTION_NOT_RESPONDING' ||
    code === 'INTERNAL_SERVER_ERROR' ||
    code === 'PRODUCT_NOT_READY' ||
    code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'
  ) {
    return new ProviderError(
      'unavailable',
      'Your bank is not answering right now. Try again in a few minutes.',
      asProviderCode(code),
    );
  }
  if (code === 'ITEM_LIMIT_EXCEEDED' || code === 'USER_PERMISSION_REVOKED') {
    return new ProviderError(
      'limit',
      'This bank connection cannot be added right now.',
      asProviderCode(code),
    );
  }
  return new ProviderError(
    'unavailable',
    'The bank connection did not work. Try again in a few minutes.',
    asProviderCode(code),
  );
}

export async function call<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number | null = null,
) {
  const clientId = readSecret(PLAID_CLIENT_ID);
  const secret = readSecret(PLAID_SECRET);
  if (!clientId || !secret) {
    throw new ProviderError('unavailable', 'Bank linking is not set up yet.');
  }
  const response = await fetch(`${host()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
    ...(timeoutMs === null ? {} : { signal: AbortSignal.timeout(timeoutMs) }),
  }).catch(() => {
    throw new ProviderError(
      'unavailable',
      'Could not reach the bank connection. Try again in a few minutes.',
    );
  });
  const json = (await response.json().catch(() => ({}))) as T & PlaidFailure;
  if (!response.ok) throw toProviderError(json.error_code ?? '');
  return json;
}

interface PlaidAccount {
  account_id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: {
    current: number | null;
    available?: number | null;
    limit?: number | null;
    last_updated_datetime?: string | null;
  };
}

const CAPITAL_ONE = 'ins_128026';
const APPLE_CARD = 'ins_136439';
/** A live read can take 30 seconds at some banks; past this the saved balance stands in, so one slow bank never holds up the rest. */
const LIVE_READ_TIMEOUT_MS = 20_000;
/** How old a saved balance a live read may fall back to where the bank shares no live one. */
const SAVED_BALANCE_MAX_AGE_MS = 30 * 86_400_000;

/** Plaid documents these as sharing only a saved balance: Capital One for everything but checking and savings, Apple Card for all. */
const hasInstantBalance = (institutionId: string | null, type: string) =>
  institutionId !== APPLE_CARD &&
  !(institutionId === CAPITAL_ONE && type !== 'depository');

const toRaw = (
  account: PlaidAccount,
  refreshedAt: string | null,
  institutionId: string | null,
): RawAccount => ({
  id: account.account_id,
  name: account.name,
  type: account.type,
  subtype: account.subtype,
  mask: account.mask,
  currentBalance: account.balances.current,
  availableBalance: account.balances.available ?? null,
  limit: account.balances.limit ?? null,
  hasInstantBalance: hasInstantBalance(institutionId, account.type),
  balanceUpdatedAt: account.balances.last_updated_datetime ?? refreshedAt,
});

interface PlaidTransaction {
  transaction_id: string;
  pending_transaction_id: string | null;
  account_id: string;
  date: string;
  amount: number;
  merchant_name: string | null;
  logo_url?: string | null;
  name: string | null;
  personal_finance_category?: { detailed?: string | null } | null;
  pending: boolean;
}

interface PlaidSyncPage {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
}

const toTransactions = (list: PlaidTransaction[]) =>
  list.flatMap((entry): NormalizedTransaction[] => {
    const normalized = normalizeTransaction({
      id: entry.transaction_id,
      pendingId: entry.pending_transaction_id,
      accountId: entry.account_id,
      date: entry.date,
      amount: entry.amount,
      merchantName: entry.merchant_name,
      logoUrl: entry.logo_url ?? null,
      name: entry.name,
      category: entry.personal_finance_category?.detailed ?? null,
      isPending: entry.pending,
    });
    return normalized ? [normalized] : [];
  });

/** Plaid sends a base64 PNG; anything else is dropped rather than drawn. */
const toLogoUrl = (logo: string | null | undefined) =>
  typeof logo === 'string' &&
  /^[A-Za-z0-9+/=]+$/.test(logo) &&
  logo.length < 200_000
    ? `data:image/png;base64,${logo}`
    : null;

interface PlaidCreditLiability {
  account_id: string;
  minimum_payment_amount?: number | null;
  last_statement_balance?: number | null;
  last_statement_issue_date?: string | null;
  next_payment_due_date?: string | null;
  last_payment_amount?: number | null;
  last_payment_date?: string | null;
}

const NEEDS_CONSENT_CODES = new Set([
  'ADDITIONAL_CONSENT_REQUIRED',
  'ACCESS_NOT_GRANTED',
]);
const UNSUPPORTED_CODES = new Set([
  'PRODUCTS_NOT_SUPPORTED',
  'PRODUCT_NOT_ENABLED',
  'NO_LIABILITY_ACCOUNTS',
  'INVALID_PRODUCT',
]);

const createLinkToken = (body: Record<string, unknown>) =>
  call<{ link_token: string }>('/link/token/create', body);

export const plaidProvider: BankDataProvider = {
  async createLinkSession(uid, update) {
    const base = {
      user: { client_user_id: uid },
      client_name: 'Runway',
      country_codes: ['US'],
      language: 'en',
      ...(isEmulator() ? {} : { webhook: webhookUrl() }),
    };
    if (update) {
      const { link_token } = await createLinkToken({
        ...base,
        access_token: update.accessToken,
        update: { account_selection_enabled: update.accountSelection },
        ...(update.askCardConsent
          ? { additional_consented_products: ['liabilities'] }
          : {}),
      });
      return { linkToken: link_token };
    }
    const fresh = {
      ...base,
      products: ['transactions'],
      transactions: { days_requested: LINK_DAYS_REQUESTED },
    };
    const { link_token } = await createLinkToken({
      ...fresh,
      additional_consented_products: ['liabilities'],
    }).catch((error: unknown) => {
      if (
        !(error instanceof ProviderError) ||
        error.code !== 'INVALID_PRODUCT'
      ) {
        throw error;
      }
      logger.warn('runway.link.cardDetailsUnavailable');
      return createLinkToken(fresh);
    });
    return { linkToken: link_token };
  },

  async exchange(publicToken) {
    const exchanged = await call<{ access_token: string; item_id: string }>(
      '/item/public_token/exchange',
      { public_token: publicToken },
    );
    const grant: ProviderGrant = {
      credential: exchanged.access_token,
      providerItemId: exchanged.item_id,
    };
    return grant;
  },

  async getInstitution(grant) {
    const { item } = await call<{ item: { institution_id: string | null } }>(
      '/item/get',
      { access_token: grant.credential },
    );
    if (!item.institution_id) return null;
    const { institution } = await call<{
      institution: { name: string; logo?: string | null };
    }>('/institutions/get_by_id', {
      institution_id: item.institution_id,
      country_codes: ['US'],
      options: { include_optional_metadata: true },
    });
    const result: ProviderInstitution = {
      name: institution.name || null,
      logo: toLogoUrl(institution.logo),
    };
    return result;
  },

  async listAccounts(grant, options) {
    const isLive = options?.isLive === true;
    const readAt = new Date().toISOString();
    const item = await call<{
      item?: { institution_id?: string | null };
      status?: { transactions?: { last_successful_update?: string | null } };
    }>('/item/get', { access_token: grant.credential }).catch(() => null);
    const institutionId = item?.item?.institution_id ?? null;
    const savedAt = item?.status?.transactions?.last_successful_update ?? null;
    // A saved read is Plaid's copy from its last refresh of the Item; a live one signs in to the bank now, so it is asked only when the person is looking.
    const { accounts } = await call<{ accounts: PlaidAccount[] }>(
      isLive ? '/accounts/balance/get' : '/accounts/get',
      {
        access_token: grant.credential,
        ...(isLive
          ? {
              options: {
                min_last_updated_datetime: new Date(
                  Date.now() - SAVED_BALANCE_MAX_AGE_MS,
                )
                  .toISOString()
                  .replace(/\.\d{3}Z$/, 'Z'),
              },
            }
          : {}),
      },
      isLive ? LIVE_READ_TIMEOUT_MS : null,
    );
    if (accounts.length === 0) throw toProviderError('NO_ACCOUNTS');
    return accounts.map((account) => {
      // Without the institution, a saved balance can't be told from a live one, so none is called live.
      const raw = {
        ...toRaw(account, savedAt, institutionId),
        ...(institutionId === null ? { hasInstantBalance: false } : {}),
      };
      return normalizeAccount(
        isLive && raw.hasInstantBalance
          ? { ...raw, balanceUpdatedAt: readAt }
          : raw,
      );
    });
  },

  async listCardStatements(grant) {
    const read = await call<{
      liabilities?: { credit?: PlaidCreditLiability[] | null };
    }>('/liabilities/get', { access_token: grant.credential }).then(
      (response) => response,
      (error: unknown) => {
        if (!(error instanceof ProviderError) || error.code === null) {
          throw error;
        }
        const answer: CardStatementRead | null = NEEDS_CONSENT_CODES.has(
          error.code,
        )
          ? { kind: 'needsConsent' }
          : UNSUPPORTED_CODES.has(error.code)
            ? { kind: 'unsupported' }
            : error.code === 'PRODUCT_NOT_READY'
              ? { kind: 'notReady' }
              : null;
        if (answer === null) throw error;
        return answer;
      },
    );
    if ('kind' in read) return read;
    const answer: CardStatementRead = {
      kind: 'ok',
      statements: (read.liabilities?.credit ?? []).map((entry) =>
        normalizeCardStatement({
          accountId: entry.account_id,
          minimumPayment: entry.minimum_payment_amount ?? null,
          lastStatementBalance: entry.last_statement_balance ?? null,
          lastStatementIssueDate: entry.last_statement_issue_date ?? null,
          nextPaymentDueDate: entry.next_payment_due_date ?? null,
          lastPaymentAmount: entry.last_payment_amount ?? null,
          lastPaymentDate: entry.last_payment_date ?? null,
        }),
      ),
    };
    return answer;
  },

  async refreshTransactions(grant) {
    await call('/transactions/refresh', { access_token: grant.credential });
  },

  async revoke(grant) {
    await call('/item/remove', { access_token: grant.credential });
  },

  async listTransactionDetails(grant, startDate, endDate) {
    const read = async (
      offset: number,
      carried: TransactionDetails[],
    ): Promise<TransactionDetails[]> => {
      const page = await call<{
        transactions: PlaidTransaction[];
        total_transactions: number;
      }>('/transactions/get', {
        access_token: grant.credential,
        start_date: startDate,
        end_date: endDate,
        options: { count: SYNC_PAGE_SIZE, offset },
      });
      const logos = page.transactions.flatMap((entry): TransactionDetails[] => {
        const merchantLogo = toHttpsUrl(entry.logo_url);
        const bankName = toBankName(entry.merchant_name, entry.name);
        return merchantLogo || bankName
          ? [
              {
                providerTransactionId: entry.transaction_id,
                pendingTransactionId: entry.pending_transaction_id || null,
                merchantLogo,
                bankName,
              },
            ]
          : [];
      });
      const next = offset + page.transactions.length;
      const merged = [...carried, ...logos];
      return page.transactions.length > 0 &&
        next < page.total_transactions &&
        next < SYNC_PAGE_SIZE * MAX_LOGO_PAGES
        ? read(next, merged)
        : merged;
    };
    return read(0, []);
  },

  async syncTransactions(grant, cursor) {
    const read = async (
      from: string | null,
      pages: number,
      carried: TransactionSync,
    ): Promise<TransactionSync> => {
      const page = await call<PlaidSyncPage>('/transactions/sync', {
        access_token: grant.credential,
        count: SYNC_PAGE_SIZE,
        ...(from === null ? {} : { cursor: from }),
      });
      const merged: TransactionSync = {
        added: [...carried.added, ...toTransactions(page.added)],
        modified: [...carried.modified, ...toTransactions(page.modified)],
        removed: [
          ...carried.removed,
          ...page.removed.map((entry) => entry.transaction_id),
        ],
        nextCursor: page.next_cursor,
        hasMore: page.has_more,
      };
      return page.has_more && pages + 1 < MAX_PAGES_PER_CALL
        ? read(page.next_cursor, pages + 1, merged)
        : merged;
    };
    return read(cursor, 0, {
      added: [],
      modified: [],
      removed: [],
      nextCursor: cursor ?? '',
      hasMore: false,
    });
  },
};

export interface WebhookKey {
  kty: string;
  crv: string;
  x: string;
  y: string;
  alg?: string;
  kid?: string;
  expired_at?: number | null;
}

const KEY_TTL_MS = 24 * 60 * 60 * 1000;
const LOOKUP_GAP_MS = 2 * 1000;
const MAX_KEYS = 20;
const KEY_ID_SHAPE = /^[0-9a-f-]{36}$/i;
const keyCache = new Map<string, { key: WebhookKey; until: number }>();
const inFlight = new Map<string, Promise<WebhookKey | null>>();
let lastLookupAt = 0;

/** The public key Plaid signed a webhook with; null when Plaid does not know the id. Live keys are kept per instance for a day. */
export async function getWebhookKey(keyId: string): Promise<WebhookKey | null> {
  const now = Date.now();
  const cached = keyCache.get(keyId);
  if (cached && cached.until > now) return cached.key;
  // Requests that arrive together for one id wait on one lookup instead of meeting the limit below.
  const pending = inFlight.get(keyId);
  if (pending) return pending;
  // The id comes from an unsigned header, so anyone can send a new one: at most one lookup every two seconds per instance.
  if (!KEY_ID_SHAPE.test(keyId) || now - lastLookupAt < LOOKUP_GAP_MS) {
    return null;
  }
  lastLookupAt = now;
  const lookup = call<{ key: WebhookKey }>('/webhook_verification_key/get', {
    key_id: keyId,
  })
    .catch(() => null)
    .then((response) => {
      const key = response?.key ?? null;
      if (key !== null && key.expired_at == null) {
        if (keyCache.size >= MAX_KEYS) keyCache.clear();
        keyCache.set(keyId, { key, until: now + KEY_TTL_MS });
      }
      return key;
    })
    .finally(() => inFlight.delete(keyId));
  inFlight.set(keyId, lookup);
  return lookup;
}
