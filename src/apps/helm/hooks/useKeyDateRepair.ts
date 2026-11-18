import { useEffect, useRef } from 'react';

import { useAppSelector } from '@/store';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { rebuildKeyDateIndex } from '@apps/helm/store/actions/keyDateActions';
import { isIndexDrifted } from '@apps/helm/utils/keyDateIndex';

/** A write on this device moves the index and a counter in one transaction but reaches the listeners separately, so a gap that is only a moment is left alone. */
const DRIFT_WAIT_MS = 4_000;

/** Rebuilds the index from the date documents when it and the people's counters disagree and stay apart; once per disagreement, never offline. */
export function useKeyDateRepair(uid: string | null) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const index = useAppSelector((state) => state.helm.keyDateIndex);
  const who = useAppSelector((state) => state.helm.who);
  const counted = who.items.reduce(
    (total, entry) => total + entry.yearlyDateCount,
    0,
  );
  const tried = useRef('');
  const isReady = keyStatus === 'ready' && index.isLoaded && who.isLoaded;
  const isDrifted = isReady && isIndexDrifted(index.entryCount, counted);

  useEffect(() => {
    if (!uid || !isDrifted) return;
    const signature = `${index.entryCount}:${counted}`;
    const timer = setTimeout(() => {
      if (tried.current === signature || !navigator.onLine) return;
      tried.current = signature;
      const counts = new Map(
        who.items.map((entry) => [entry.id, entry.yearlyDateCount]),
      );
      getHelmEncryption(uid)
        .then((encryption) => rebuildKeyDateIndex(uid, encryption, counts))
        .catch((error: unknown) =>
          console.error('Helm dates index was not rebuilt', error),
        );
    }, DRIFT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [uid, isDrifted, index.entryCount, counted, who.items]);
}
