import { onValue, ref } from 'firebase/database';
import { useEffect, useMemo, useState } from 'react';

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

function buildPresenceEntry(uid: string, value: unknown): PresenceEntry {
  const status = normalizePresence(value);
  const isOnline = status.state === 'online';

  return {
    userId: uid,
    ...status,
    isOnline,
    isHere: isOnline && status.currentLocation === 'worth-the-wait',
  };
}

export type PresenceMapResult = {
  map: Record<string, PresenceEntry>;
  presence: PresenceEntry[];
};

export function usePresence(userId?: string | null): PresenceEntry | null;
export function usePresence(
  userIds?: string[] | null,
): PresenceMapResult | null;
export function usePresence(
  userIds?: string | string[] | null,
): PresenceEntry | PresenceMapResult | null {
  const ids = useMemo(() => {
    if (!userIds) {
      return [];
    }

    const nextIds = Array.isArray(userIds) ? userIds : [userIds];
    return nextIds.filter((uid) => Boolean(uid));
  }, [userIds]);

  const [presence, setPresence] = useState<PresenceEntry[]>([]);

  useEffect(() => {
    if (ids.length === 0) {
      return;
    }

    const listeners = ids.map((uid) => {
      const statusRef = ref(realtimeDb, `status/${uid}`);

      return onValue(statusRef, (snapshot) => {
        const nextEntry = buildPresenceEntry(uid, snapshot.val());

        setPresence((current) => {
          const filtered = current.filter((entry) => entry.userId !== uid);
          return [...filtered, nextEntry];
        });
      });
    });

    return () => {
      listeners.forEach((unsubscribe) => unsubscribe());
    };
  }, [ids]);

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
        (uid) => presenceMap[uid] ?? buildPresenceEntry(uid, null),
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
      presenceMap[ids[0]] ?? buildPresenceEntry(ids[0], null);
    return singlePresence;
  }, [ids, presenceMap, userIds]);

  return result;
}
