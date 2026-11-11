import { httpsCallable } from 'firebase/functions';

import { auth, functions } from '@lib/firebase/config';
import { APP_REGISTRY_ID_MAP } from '@/lib/app';
import { queryClient } from '@lib/query/queryClient';
import { readDeviceSecret } from '@lib/security';
import {
  TRUSTED_KEY_MAX_UNCHECKED_MS,
  createTrustedKeyStore,
} from '@lib/security/trustedKey';

import { normalizeHelmEncryption } from '@apps/helm/security';
import { keepDropBoxKey } from '@apps/helm/store/actions/outboxActions';

export const helmQueryKeys = {
  all: ['helm'] as const,
  key: (uid: string) => [...helmQueryKeys.all, 'key', uid] as const,
};

const getHelmKeyCallable = httpsCallable<{ deviceId: null }, unknown>(
  functions,
  'getHelmKey',
);

/** The app's registry name, as the site's trust switch and its offline lines say it. */
export const helmAppName = APP_REGISTRY_ID_MAP.helm?.name ?? '';

const LAST_ONLINE_PREFIX = 'helmKeyReachedAt:';

const KEY_SECRET = 'helm-data-key';

const rememberServerReached = (uid: string) => {
  try {
    localStorage.setItem(`${LAST_ONLINE_PREFIX}${uid}`, String(Date.now()));
  } catch {
    // A browser that refuses storage simply shows no "As of" time.
  }
};

const forgetServerReached = (uid: string) => {
  try {
    localStorage.removeItem(`${LAST_ONLINE_PREFIX}${uid}`);
  } catch {
    // Nothing was kept to remove.
  }
};

/** When this browser last got the key from the server, for the "As of" line; never the key itself. */
export const readServerReachedAt = (uid: string) => {
  try {
    const value = Number(localStorage.getItem(`${LAST_ONLINE_PREFIX}${uid}`));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

/** The data key: held in memory for the session, and in a browser the person trusts, a sealed copy used only when the server can't be reached. */
export const helmKeyStore = createTrustedKeyStore({
  name: KEY_SECRET,
  queryKey: helmQueryKeys.key,
  normalize: normalizeHelmEncryption,
  fetchServerKey: async () => {
    const response = await getHelmKeyCallable({ deviceId: null });
    const encryption = normalizeHelmEncryption(response.data);
    if (!encryption) {
      throw new Error('The key did not arrive in the expected shape.');
    }
    const uid = auth.currentUser?.uid;
    if (uid) {
      // Only a browser keeping the copy remembers when the server last answered.
      void readDeviceSecret(uid, KEY_SECRET, Infinity)
        .then((kept) => (kept ? rememberServerReached(uid) : undefined))
        .catch(() => undefined);
      void keepDropBoxKey(
        uid,
        (response.data as { dropBoxKey?: unknown } | null)?.dropBoxKey,
      );
    }
    return encryption;
  },
});

/** The store the Settings switch drives: the same, plus the time the switch went on or off, so a lapsed copy can be told from one never kept. */
export const helmTrustStore = {
  ...helmKeyStore,
  setTrusted: async (uid: string, isTrusted: boolean) => {
    await helmKeyStore.setTrusted(uid, isTrusted);
    if (isTrusted) rememberServerReached(uid);
    else forgetServerReached(uid);
  },
};

/** True when this browser kept the key once and the server hasn't confirmed it for longer than the limit, so it no longer opens offline. */
export const hasLapsedTrust = (uid: string) => {
  const reachedAt = readServerReachedAt(uid);
  return (
    reachedAt !== null && Date.now() - reachedAt > TRUSTED_KEY_MAX_UNCHECKED_MS
  );
};

export const getHelmEncryption = helmKeyStore.getKey;
export const isKeptKey = helmKeyStore.isKeptKey;

// Cancelling first discards a read still in flight, so nothing it opened lands after the key is gone.
export const clearHelmKey = () => {
  void queryClient.cancelQueries({ queryKey: helmQueryKeys.all });
  queryClient.removeQueries({ queryKey: helmQueryKeys.all });
};
