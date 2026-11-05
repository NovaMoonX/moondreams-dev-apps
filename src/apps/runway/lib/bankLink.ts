const SCRIPT_URL = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

interface ProviderMetadata {
  institution: { name: string } | null;
}

interface ProviderHandler {
  open: () => void;
  destroy: () => void;
}

interface ProviderWindow {
  create: (options: {
    token: string;
    onSuccess: (publicToken: string, metadata: ProviderMetadata) => void;
    onExit: () => void;
  }) => ProviderHandler;
}

export interface BankLinkResult {
  publicToken: string;
  institutionName: string | null;
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

/** Opens the bank's own sign-in window; resolves with what it hands back, or null when the person closed it or the bank refused. */
export async function openBankLink(
  linkToken: string,
): Promise<BankLinkResult | null> {
  if (import.meta.env.DEV && linkToken === STAND_IN_TOKEN) {
    return { publicToken: 'fake-public-token', institutionName: 'Chase' };
  }
  const provider = await loadProvider();
  return new Promise((resolve) => {
    const handler = provider.create({
      token: linkToken,
      onSuccess: (publicToken, metadata) => {
        resolve({
          publicToken,
          institutionName: metadata.institution?.name ?? null,
        });
        handler.destroy();
      },
      onExit: () => {
        resolve(null);
        handler.destroy();
      },
    });
    handler.open();
  });
}
