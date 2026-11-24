const SCRIPT_URL = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

interface ProviderMetadata {
  institution: { name: string } | null;
  accounts?: { name?: string | null; mask?: string | null }[];
}

interface ProviderExitError {
  error_type?: string;
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
}

interface ProviderExitMetadata {
  institution?: { name?: string; institution_id?: string } | null;
  status?: string | null;
  link_session_id?: string;
  request_id?: string;
}

/** The bank's window closed on an error of its own; `facts` holds its codes and ids, never a token. */
export class BankWindowError extends Error {
  readonly facts: string[];
  constructor(error: ProviderExitError, metadata: ProviderExitMetadata) {
    super(
      error.display_message?.trim() ||
        'The bank\u2019s window could not connect. Try again in a few minutes.',
    );
    this.name = 'BankWindowError';
    this.facts = [
      ['Window error', error.error_code],
      ['Type', error.error_type],
      ['Message', error.error_message],
      ['Bank', metadata.institution?.name],
      ['Institution', metadata.institution?.institution_id],
      ['Window step', metadata.status],
      ['Link session', metadata.link_session_id],
      ['Request', metadata.request_id],
    ]
      .filter((pair): pair is [string, string] => Boolean(pair[1]))
      .map(([label, value]) => `${label}: ${value}`);
  }
}

interface ProviderHandler {
  open: () => void;
  destroy: () => void;
}

interface ProviderWindow {
  create: (options: {
    token: string;
    onSuccess: (publicToken: string, metadata: ProviderMetadata) => void;
    onExit: (
      error: ProviderExitError | null,
      metadata: ProviderExitMetadata,
    ) => void;
  }) => ProviderHandler;
}

export interface BankLinkResult {
  publicToken: string;
  institutionName: string | null;
  /** The accounts the person shared, by name and last digits, so a repeat sign-in is caught before it becomes a second link. */
  accounts: { name: string; mask: string | null }[];
}

const loader: { promise: Promise<ProviderWindow> | null } = { promise: null };

const getProvider = () =>
  (window as unknown as { Plaid?: ProviderWindow }).Plaid ?? null;

function loadProvider(): Promise<ProviderWindow> {
  const known = getProvider();
  if (known) return Promise.resolve(known);
  if (loader.promise) return loader.promise;
  const loading = new Promise<ProviderWindow>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const loaded = getProvider();
      if (loaded) resolve(loaded);
      else reject(new Error('The bank window did not load.'));
    };
    script.onerror = () => reject(new Error('The bank window did not load.'));
    document.head.appendChild(script);
  });
  loader.promise = loading;
  loading.catch(() => {
    loader.promise = null;
  });
  return loading;
}

/** The token the local stand-in bank hands out; the window is skipped for it in development only. */
const STAND_IN_TOKEN = 'fake-link-token';

/** Opens the bank's own sign-in window; resolves with what it hands back, or null when the person closed it; rejects with `BankWindowError` when the window ended on its own error. */
export async function openBankLink(
  linkToken: string,
): Promise<BankLinkResult | null> {
  if (import.meta.env.DEV && linkToken === STAND_IN_TOKEN) {
    return {
      publicToken: 'fake-public-token',
      institutionName: 'Chase',
      accounts: [],
    };
  }
  const provider = await loadProvider();
  return new Promise((resolve, reject) => {
    const handler = provider.create({
      token: linkToken,
      onSuccess: (publicToken, metadata) => {
        resolve({
          publicToken,
          institutionName: metadata.institution?.name ?? null,
          accounts: (metadata.accounts ?? []).map((account) => ({
            name: account.name ?? '',
            mask: account.mask ?? null,
          })),
        });
        handler.destroy();
      },
      onExit: (error, metadata) => {
        if (error) reject(new BankWindowError(error, metadata ?? {}));
        else resolve(null);
        handler.destroy();
      },
    });
    handler.open();
  });
}
