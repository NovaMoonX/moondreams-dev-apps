import { queryOptions } from '@tanstack/react-query';

import { auth } from '@lib/firebase/config';
import { queryClient } from '@lib/query/queryClient';

import {
  canKeepDeviceSecrets,
  forgetDeviceSecret,
  keepDeviceSecret,
  markDeviceSecretChecked,
  readDeviceSecret,
} from './deviceSecrets';

type ServerKey = { keyId: string; key: string };

type TrustedKeyConfig<T extends ServerKey> = {
  /** Unique per app, e.g. `runway-plan-key`. */
  name: string;
  queryKey: (uid: string) => readonly unknown[];
  fetchServerKey: () => Promise<T>;
  normalize: (value: unknown) => T | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** A kept key the server has not confirmed for this long is removed: a lost device stops opening the data. */
export const TRUSTED_KEY_MAX_UNCHECKED_MS = 30 * DAY_MS;
const SERVER_WAIT_WITH_KEPT_KEY_MS = 6000;
const UNREACHABLE_CODES = new Set([
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/internal',
]);
const REFUSED_CODES = new Set([
  'functions/permission-denied',
  'functions/unauthenticated',
  'functions/not-found',
  'functions/failed-precondition',
]);

function readCode(error: unknown) {
  return (error as { code?: string } | null)?.code ?? '';
}

function isUnreachable(error: unknown) {
  return (
    error === 'timeout' ||
    UNREACHABLE_CODES.has(readCode(error)) ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  );
}

/**
 * A server-held data key with an opt-in copy on a trusted device: the server is asked first,
 * the copy stands in only when it can't be reached, and the copy is removed whenever the data could be at risk.
 */
export function createTrustedKeyStore<T extends ServerKey>(
  config: TrustedKeyConfig<T>,
) {
  const keptKeysInUse = new WeakSet<T>();
  const writes = new Map<string, Promise<unknown>>();
  const trustedQueryKey = (uid: string) =>
    [...config.queryKey(uid), 'trusted'] as const;

  // Each account's writes run in order, and one that lands after the account left is dropped.
  const queueWrite = (uid: string, write: () => Promise<void>) => {
    const next = (writes.get(uid) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => (auth.currentUser?.uid === uid ? write() : undefined));
    writes.set(uid, next);
    return next;
  };

  const readKept = async (uid: string) => {
    const text = await readDeviceSecret(
      uid,
      config.name,
      TRUSTED_KEY_MAX_UNCHECKED_MS,
    );
    if (!text) return null;
    try {
      return config.normalize(JSON.parse(text));
    } catch {
      return null;
    }
  };

  const forget = async (uid: string) => {
    await queueWrite(uid, () => forgetDeviceSecret(uid, config.name));
    queryClient.setQueryData(trustedQueryKey(uid), false);
  };

  const loadKey = async (uid: string) => {
    const kept = await readKept(uid);
    if (!kept) return config.fetchServerKey();
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject('timeout'), SERVER_WAIT_WITH_KEPT_KEY_MS),
    );
    try {
      const fresh = await Promise.race([config.fetchServerKey(), timeout]);
      const isSame = fresh.keyId === kept.keyId && fresh.key === kept.key;
      void queueWrite(uid, () =>
        isSame
          ? markDeviceSecretChecked(uid, config.name)
          : keepDeviceSecret(uid, config.name, JSON.stringify(fresh)),
      ).catch(() => undefined);
      return fresh;
    } catch (error) {
      if (REFUSED_CODES.has(readCode(error))) {
        await forget(uid).catch(() => undefined);
        throw error;
      }
      if (!isUnreachable(error)) throw error;
      keptKeysInUse.add(kept);
      return kept;
    }
  };

  const keyQueryOptions = (uid: string) =>
    queryOptions({
      queryKey: config.queryKey(uid),
      queryFn: () => loadKey(uid),
      staleTime: Infinity,
      retry: false,
    });

  const getKey = (uid: string) => queryClient.fetchQuery(keyQueryOptions(uid));

  return {
    keyQueryOptions,
    getKey,
    /** True when this key is the device's copy, used because the server could not be reached: it must never create data. */
    isKeptKey: (key: T) => keptKeysInUse.has(key),
    trustedQueryOptions: (uid: string) =>
      queryOptions({
        queryKey: trustedQueryKey(uid),
        queryFn: async () => (await readKept(uid)) !== null,
        staleTime: Infinity,
        enabled: canKeepDeviceSecrets(),
      }),
    /** Keeps the key on this device, or removes it; the switch moves at once and returns if the write fails. */
    setTrusted: async (uid: string, isTrusted: boolean) => {
      const queryKey = trustedQueryKey(uid);
      const before = queryClient.getQueryData<boolean>(queryKey);
      queryClient.setQueryData(queryKey, isTrusted);
      try {
        await queueWrite(uid, async () => {
          if (!isTrusted) {
            await forgetDeviceSecret(uid, config.name);
            return;
          }
          const key = await getKey(uid);
          await keepDeviceSecret(uid, config.name, JSON.stringify(key));
        });
      } catch (error) {
        queryClient.setQueryData(queryKey, before ?? !isTrusted);
        throw error;
      }
    },
    /** Removes the kept key, for when the data it opens is deleted or replaced. */
    forget,
  };
}

export type TrustedKeyStore = Pick<
  ReturnType<typeof createTrustedKeyStore>,
  'trustedQueryOptions' | 'setTrusted'
>;
