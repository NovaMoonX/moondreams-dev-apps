import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';
import { createTrustedKeyStore } from '@lib/security/trustedKey';

import { normalizeRunwayEncryption } from '@apps/runway/security';

export const runwayQueryKeys = {
  all: ['runway'] as const,
  key: (uid: string) => [...runwayQueryKeys.all, 'key', uid] as const,
};

const getRunwayKeyCallable = httpsCallable<Record<string, never>, unknown>(
  functions,
  'getRunwayKey',
);

/** The plan key: held in memory for the session, and on a device the person trusts, a sealed copy for offline opening. */
export const runwayKeyStore = createTrustedKeyStore({
  name: 'runway-plan-key',
  queryKey: runwayQueryKeys.key,
  normalize: normalizeRunwayEncryption,
  fetchServerKey: async () => {
    const response = await getRunwayKeyCallable({});
    const encryption = normalizeRunwayEncryption(response.data);
    if (!encryption) {
      throw new Error('The plan key did not arrive in the expected shape.');
    }
    return encryption;
  },
});

export const getRunwayEncryption = runwayKeyStore.getKey;
export const isKeptKey = runwayKeyStore.isKeptKey;
