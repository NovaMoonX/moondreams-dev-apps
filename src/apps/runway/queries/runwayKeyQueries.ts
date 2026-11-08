import { queryOptions } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';
import { queryClient } from '@lib/query/queryClient';
import {
  canKeepDeviceSecrets,
  forgetDeviceSecret,
  keepDeviceSecret,
  readDeviceSecret,
} from '@lib/security';

import { normalizeRunwayEncryption } from '@apps/runway/security';
import type { RunwayEncryption } from '@apps/runway/types';

export const runwayQueryKeys = {
  all: ['runway'] as const,
  key: (uid: string) => [...runwayQueryKeys.all, 'key', uid] as const,
  trusted: (uid: string) => [...runwayQueryKeys.all, 'trusted', uid] as const,
};

const DEVICE_KEY_NAME = 'runway-plan-key';

const getRunwayKeyCallable = httpsCallable<Record<string, never>, unknown>(
  functions,
  'getRunwayKey',
);

async function fetchServerKey() {
  const response = await getRunwayKeyCallable({});
  const encryption = normalizeRunwayEncryption(response.data);
  if (!encryption) {
    throw new Error('The plan key did not arrive in the expected shape.');
  }
  return encryption;
}

async function readTrustedKey(uid: string) {
  const text = await readDeviceSecret(uid, DEVICE_KEY_NAME);
  if (!text) return null;
  try {
    return normalizeRunwayEncryption(JSON.parse(text));
  } catch {
    return null;
  }
}

// The device copy opens the plan at once (and offline); the server's answer replaces it if the key ever changed.
function checkTrustedKey(uid: string, kept: RunwayEncryption) {
  fetchServerKey()
    .then(async (encryption) => {
      if (encryption.keyId === kept.keyId && encryption.key === kept.key) return;
      await keepDeviceSecret(uid, DEVICE_KEY_NAME, JSON.stringify(encryption));
      queryClient.setQueryData(runwayQueryKeys.key(uid), encryption);
    })
    .catch(() => undefined);
}

/** Held in memory for the session, never in the query persister; a trusted device also keeps a sealed copy (`@lib/security` device secrets). */
export function runwayKeyQueryOptions(uid: string) {
  return queryOptions({
    queryKey: runwayQueryKeys.key(uid),
    queryFn: async () => {
      const kept = await readTrustedKey(uid);
      if (kept) {
        checkTrustedKey(uid, kept);
        return kept;
      }
      return fetchServerKey();
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function getRunwayEncryption(uid: string) {
  return queryClient.fetchQuery(runwayKeyQueryOptions(uid));
}

export function trustedDeviceQueryOptions(uid: string) {
  return queryOptions({
    queryKey: runwayQueryKeys.trusted(uid),
    queryFn: async () => (await readTrustedKey(uid)) !== null,
    staleTime: Infinity,
    enabled: canKeepDeviceSecrets(),
  });
}

/** Keeps the plan key on this device, or removes it, so the plan opens without a connection. */
export async function setTrustedDevice(uid: string, isTrusted: boolean) {
  const queryKey = runwayQueryKeys.trusted(uid);
  const before = queryClient.getQueryData<boolean>(queryKey);
  queryClient.setQueryData(queryKey, isTrusted);
  try {
    if (isTrusted) {
      const encryption = await getRunwayEncryption(uid);
      await keepDeviceSecret(uid, DEVICE_KEY_NAME, JSON.stringify(encryption));
    } else {
      await forgetDeviceSecret(uid, DEVICE_KEY_NAME);
    }
  } catch (error) {
    queryClient.setQueryData(queryKey, before ?? !isTrusted);
    throw error;
  }
}
