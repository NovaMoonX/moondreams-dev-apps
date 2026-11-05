import { defineSecret } from 'firebase-functions/params';

import { normalizeAccount, type RawAccount } from './normalize.js';
import {
  ProviderError,
  type BankDataProvider,
  type ProviderGrant,
} from './provider.js';

export const PLAID_CLIENT_ID = defineSecret('RUNWAY_PLAID_CLIENT_ID');
export const PLAID_SECRET = defineSecret('RUNWAY_PLAID_SECRET');
export const PROVIDER_SECRETS = [PLAID_CLIENT_ID, PLAID_SECRET];

const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';
const host = () =>
  isEmulator() ? 'https://sandbox.plaid.com' : 'https://production.plaid.com';

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

function toProviderError(code: string): ProviderError {
  if (code === 'ITEM_LOGIN_REQUIRED') {
    return new ProviderError(
      'needsAttention',
      'Your bank needs you to sign in again.',
    );
  }
  if (code === 'INVALID_PUBLIC_TOKEN' || code === 'INVALID_LINK_TOKEN') {
    return new ProviderError(
      'rejected',
      'That bank sign-in expired. Start again.',
    );
  }
  if (
    code === 'RATE_LIMIT_EXCEEDED' ||
    code === 'INSTITUTION_DOWN' ||
    code === 'INSTITUTION_NOT_RESPONDING' ||
    code === 'INTERNAL_SERVER_ERROR' ||
    code === 'PRODUCT_NOT_READY'
  ) {
    return new ProviderError(
      'unavailable',
      'Your bank is not answering right now. Try again in a few minutes.',
    );
  }
  if (code === 'ITEM_LIMIT_EXCEEDED' || code === 'USER_PERMISSION_REVOKED') {
    return new ProviderError(
      'limit',
      'This bank connection cannot be added right now.',
    );
  }
  return new ProviderError(
    'unavailable',
    'The bank connection did not work. Try again in a few minutes.',
  );
}

async function call<T>(path: string, body: Record<string, unknown>) {
  const clientId = readSecret(PLAID_CLIENT_ID);
  const secret = readSecret(PLAID_SECRET);
  if (!clientId || !secret) {
    throw new ProviderError('unavailable', 'Bank linking is not set up yet.');
  }
  const response = await fetch(`${host()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
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
  balances: { current: number | null };
}

const toRaw = (account: PlaidAccount): RawAccount => ({
  id: account.account_id,
  name: account.name,
  type: account.type,
  subtype: account.subtype,
  mask: account.mask,
  currentBalance: account.balances.current,
});

export const plaidProvider: BankDataProvider = {
  async createLinkSession(uid) {
    const { link_token } = await call<{ link_token: string }>(
      '/link/token/create',
      {
        user: { client_user_id: uid },
        client_name: 'Runway',
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
      },
    );
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

  async getInstitutionName(grant) {
    const { item } = await call<{ item: { institution_id: string | null } }>(
      '/item/get',
      { access_token: grant.credential },
    );
    if (!item.institution_id) return null;
    const { institution } = await call<{ institution: { name: string } }>(
      '/institutions/get_by_id',
      { institution_id: item.institution_id, country_codes: ['US'] },
    );
    return institution.name || null;
  },

  async listAccounts(grant) {
    const { accounts } = await call<{ accounts: PlaidAccount[] }>(
      '/accounts/balance/get',
      { access_token: grant.credential },
    );
    return accounts.map((account) => normalizeAccount(toRaw(account)));
  },

  async revoke(grant) {
    await call('/item/remove', { access_token: grant.credential });
  },
};
