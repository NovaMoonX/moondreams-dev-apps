import { createDdgProvider } from './ddg.js';
import { createGoogleProvider, type SecretReader } from './google.js';
import type { ImageProvider } from './types.js';

/** Every provider there is, by the name `IMAGE_SEARCH_PROVIDERS` uses. A new one (Serper, Unsplash) is a file with a factory like these and one line here. */
export const PROVIDER_FACTORIES: Record<
  string,
  (readSecret: SecretReader) => ImageProvider
> = {
  ddg: () => createDdgProvider(),
  google: (readSecret) => createGoogleProvider(readSecret),
};

export const DEFAULT_PROVIDER_LIST = 'ddg,google';

/** The names in `IMAGE_SEARCH_PROVIDERS` in the order they are tried: unknown names and repeats are dropped, and a list with nothing usable falls back to the default. */
export const parseProviderList = (value: string | undefined): string[] => {
  const names = (value ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(
      (name, index, all) =>
        Object.hasOwn(PROVIDER_FACTORIES, name) && all.indexOf(name) === index,
    );
  return names.length > 0 ? names : parseProviderList(DEFAULT_PROVIDER_LIST);
};
