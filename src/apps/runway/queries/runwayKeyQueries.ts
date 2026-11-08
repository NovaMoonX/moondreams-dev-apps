import { queryOptions } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { auth, functions } from '@lib/firebase/config';
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
const SERVER_WAIT_WITH_KEPT_KEY_MS = 6000;
const UNREACHABLE_CODES = new Set([
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/internal',
]);

const getRunwayKeyCallable = httpsCallable<Record<string, never>, unknown>(
  functions,
  'getRunwayKey',
);

const keptKeysInUse = new WeakSet<RunwayEncryption>();
const trustWrites = new Map<string, Promise<unknown>>();

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

function isUnreachable(error: unknown) {
  const code = (error as { code?: string } | null)?.code ?? '';
  return (
    error === 'timeout' ||
    UNREACHABLE_CODES.has(code) ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  );
}

// Each account's trust writes run in order, and one that lands after the account left is dropped.
function queueTrustWrite(uid: string, write: () => Promise<void>) {
  const previous = trustWrites.get(uid) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => (auth.currentUser?.uid === uid ? write() : undefined));
  trustWrites.set(uid, next);
  return next;
}

async function loadKey(uid: string) {
  const kept = await readTrustedKey(uid);
  if (!kept) return fetchServerKey();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject('timeout'), SERVER_WAIT_WITH_KEPT_KEY_MS),
  );
  try {
    const encryption = await Promise.race([fetchServerKey(), timeout]);
    if (encryption.keyId !== kept.keyId || encryption.key !== kept.key) {
      void queueTrustWrite(uid, () =>
        keepDeviceSecret(uid, DEVICE_KEY_NAME, JSON.stringify(encryption)),
      ).catch(() => undefined);
    }
    return encryption;
  } catch (error) {
    if (!isUnreachable(error)) throw error;
    keptKeysInUse.add(kept);
    return kept;
  }
}

/** Held in memory for the session, never in the query persister; on a trusted device a sealed copy stands in when the server can't be reached. */
export function runwayKeyQueryOptions(uid: string) {
  return queryOptions({
    queryKey: runwayQueryKeys.key(uid),
    queryFn: () => loadKey(uid),
    staleTime: Infinity,
    retry: false,
  });
}

export function getRunwayEncryption(uid: string) {
  return queryClient.fetchQuery(runwayKeyQueryOptions(uid));
}

/** True when this key is the device's copy, used because the server could not be reached; it must never create a plan. */
export function isKeptKey(encryption: RunwayEncryption) {
  return keptKeysInUse.has(encryption);
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
    await queueTrustWrite(uid, async () => {
      if (!isTrusted) {
        await forgetDeviceSecret(uid, DEVICE_KEY_NAME);
        return;
      }
      const encryption = await getRunwayEncryption(uid);
      await keepDeviceSecret(uid, DEVICE_KEY_NAME, JSON.stringify(encryption));
    });
  } catch (error) {
    queryClient.setQueryData(queryKey, before ?? !isTrusted);
    throw error;
  }
}
