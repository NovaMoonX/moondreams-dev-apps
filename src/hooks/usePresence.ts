import { onValue, ref } from 'firebase/database';
import { useEffect, useMemo, useState } from 'react';

import { AppId } from '@/lib/types/appCatalog';
import { realtimeDb } from '@lib/firebase/config';

export type PresenceStatus = {
  state: 'online' | 'offline';
  currentLocation: string | null;
  lastChanges: number | null;
};

export type PresenceEntry = PresenceStatus & {
  userId: string;
  isOnline: boolean;
  isHere: boolean;
};

function normalizePresence(value: unknown): PresenceStatus {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;

  return {
    state: data?.state === 'online' ? 'online' : 'offline',
    currentLocation:
      typeof data?.currentLocation === 'string' ? data.currentLocation : null,
    lastChanges:
      typeof data?.lastChanges === 'number' ? data.lastChanges : null,
  };
}

function buildPresenceEntry(
  uid: string,
  value: unknown,
  hereLocation?: string | null,
): PresenceEntry {
  const status = normalizePresence(value);
  const isOnline = status.state === 'online';
  const isHere =
    Boolean(hereLocation) &&
    isOnline &&
    status.currentLocation === hereLocation;

  return {
    userId: uid,
    ...status,
    isOnline,
    isHere,
  };
}

export type PresenceMapResult = {
  map: Record<string, PresenceEntry>;
  presence: PresenceEntry[];
};

export function usePresence(
  userId?: string | null,
  hereLocation?: AppId | null,
): PresenceEntry | null;

export function usePresence(
  userIds?: string[] | null,
  hereLocation?: AppId | null,
): PresenceMapResult | null;

export function usePresence(
  userIds?: string | string[] | null,
  hereLocation?: AppId | null,
): PresenceEntry | PresenceMapResult | null {
  const ids = useMemo(() => {
    if (!userIds) {
      return [];
    }

    const nextIds = Array.isArray(userIds) ? userIds : [userIds];
    const filteredIds: string[] = [];

    for (const uid of nextIds) {
      if (!uid || filteredIds.includes(uid)) {
        continue;
      }

      filteredIds.push(uid);
    }

    return filteredIds;
  }, [userIds]);

  const [presence, setPresence] = useState<PresenceEntry[]>([]);

  // Key on the id set's content, not `ids`' array identity — callers often
  // pass a freshly-mapped/filtered array each render, which would otherwise
  // tear down and resubscribe every presence listener on every re-render.
  const idsKey = ids.join(',');

  useEffect(() => {
    if (idsKey === '') {
      return;
    }

    const currentIds = idsKey.split(',');

    const listeners = currentIds.map((uid) => {
      const statusRef = ref(realtimeDb, `status/${uid}`);

      return onValue(statusRef, (snapshot) => {
        const nextEntry = buildPresenceEntry(uid, snapshot.val(), hereLocation);

        setPresence((current) => {
          const filtered = current.filter((entry) => entry.userId !== uid);
          return [...filtered, nextEntry];
        });
      });
    });

    return () => {
      listeners.forEach((unsubscribe) => unsubscribe());
    };
  }, [hereLocation, idsKey]);

  const presenceMap = useMemo(
    () =>
      presence.reduce<Record<string, PresenceEntry>>((acc, entry) => {
        acc[entry.userId] = entry;
        return acc;
      }, {}),
    [presence],
  );

  const result = useMemo(() => {
    if (ids.length === 0) {
      return null;
    }

    if (Array.isArray(userIds)) {
      const orderedPresence = ids.map(
        (uid) =>
          presenceMap[uid] ?? buildPresenceEntry(uid, null, hereLocation),
      );

      const result: PresenceMapResult = {
        map: orderedPresence.reduce<Record<string, PresenceEntry>>(
          (acc, entry) => {
            acc[entry.userId] = entry;
            return acc;
          },
          {},
        ),
        presence: orderedPresence,
      };

      return result;
    }

    const singlePresence =
      presenceMap[ids[0]] ?? buildPresenceEntry(ids[0], null, hereLocation);
    return singlePresence;
  }, [hereLocation, ids, presenceMap, userIds]);

  return result;
}
