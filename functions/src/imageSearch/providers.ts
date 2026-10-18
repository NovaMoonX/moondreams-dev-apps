import { createDdgProvider } from './ddg.js';
import { createGoogleProvider, type SecretReader } from './google.js';
import type { ImageProvider } from './types.js';

/** A new provider is a file with a factory like these and one line here. */
export const PROVIDER_FACTORIES: Record<
  string,
  (readSecret: SecretReader) => ImageProvider
> = {
  ddg: () => createDdgProvider(),
  google: (readSecret) => createGoogleProvider(readSecret),
};

export const DEFAULT_PROVIDER_LIST = 'ddg,google';

/** A list with nothing usable falls back to the default, so a typo never turns the search off. */
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
