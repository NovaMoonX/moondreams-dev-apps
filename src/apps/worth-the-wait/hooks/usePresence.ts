import { onValue, ref } from 'firebase/database';
import { useEffect, useMemo, useState } from 'react';

import { realtimeDb } from '@lib/firebase/config';

import type { UserPresence } from '../types';

function normalizePresence(data: Record<string, unknown> | null): UserPresence {
  const state =
    data?.state === 'online' ? 'online' : 'offline';

  return {
    state,
    currentLocation:
      typeof data?.currentLocation === 'string' ? data.currentLocation : null,
    lastChanges:
      typeof data?.lastChanges === 'number' ? data.lastChanges : null,
  };
}

export function usePresence(partnerUid: string | null) {
  const [presence, setPresence] = useState<UserPresence | null>(null);

  useEffect(() => {
    if (!partnerUid) {
      return;
    }

    const partnerStatusRef = ref(realtimeDb, `status/${partnerUid}`);
    const unsubscribe = onValue(partnerStatusRef, (snapshot) => {
      const nextValue = snapshot.val();
      const nextPresence: UserPresence =
        nextValue && typeof nextValue === 'object'
          ? normalizePresence(nextValue as Record<string, unknown>)
          : { state: 'offline', currentLocation: null, lastChanges: null };

      setPresence(nextPresence);
    });

    return () => unsubscribe();
  }, [partnerUid]);

  const activePresence = partnerUid ? presence : null;
  const isOnline = activePresence?.state === 'online';
  const isHere = isOnline && activePresence?.currentLocation === 'worth-the-wait';

  return useMemo(
    () => ({
      ...(activePresence ?? {}),
      isOnline,
      isHere,
    }),
    [activePresence, isHere, isOnline],
  );
}
