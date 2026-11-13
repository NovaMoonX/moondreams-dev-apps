import { useEffect, useState } from 'react';

import {
  collection,
  getCountFromServer,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@lib/firebase/config';
import { useAppSelector } from '@/store';
import { STYLE_LEARN_EVERY } from '@apps/helm/constants';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';

interface LearnResult {
  status: 'learned' | 'notEnough' | 'busy';
  traitCount: number;
}

const learnHelmStyleCallable = httpsCallable<
  Record<string, never>,
  LearnResult
>(functions, 'learnHelmStyle');

/** Persons whose call is out, and the "uid|through" marks already answered this session, so renders and a second look at the same count never call twice. A second tab is turned away by the server's `busy`. */
const inFlight = new Set<string>();
const attempted = new Set<string>();
/** Marks whose stored count is being read or was read once this session; the store's windows keep watching after that. */
const counting = new Set<string>();
const counted = new Set<string>();

/** How many typed messages after `through` are in the store's windows, a lower bound of all of them. */
const countLoaded = (
  captures: { inputMode: string; createdAt: number }[],
  through: number | null,
) =>
  captures.filter(
    (capture) =>
      capture.inputMode === 'typed' && capture.createdAt > (through ?? 0),
  ).length;

async function countStored(uid: string, through: number | null) {
  const snapshot = await getCountFromServer(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'captures'),
      where('inputMode', '==', 'typed'),
      where('createdAt', '>', through ?? 0),
    ),
  );
  return snapshot.data().count;
}

/** After every 25 new typed messages, asks the server once, in the background, to learn the person's writing style. Voice is never counted; a failure is only logged. */
export function useStyleLearning(uid: string | null) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const profile = useAppSelector((state) =>
    state.helm.uid === uid ? state.helm.profile : null,
  );
  const captures = useAppSelector(selectAllCaptures);
  const isCapturesLoaded = useAppSelector(
    (state) => state.helm.recentCaptures.isLoaded,
  );
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const isReady =
    uid !== null &&
    keyStatus === 'ready' &&
    profile !== null &&
    isCapturesLoaded &&
    isOnline;
  const through = profile?.styleLearnedThroughAt ?? null;
  const isDueInStore = countLoaded(captures, through) >= STYLE_LEARN_EVERY;

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!isReady || !uid) return;
    const mark = `${uid}|${through ?? ''}`;
    if (attempted.has(mark) || inFlight.has(uid)) return;
    const run = () => {
      inFlight.add(uid);
      learnHelmStyleCallable({})
        .then(() => {
          attempted.add(mark);
        })
        .catch((error: unknown) =>
          console.warn('Helm style learning failed', error),
        )
        .finally(() => inFlight.delete(uid));
    };
    if (isDueInStore) {
      run();
      return;
    }
    if (counted.has(mark) || counting.has(mark)) return;
    counting.add(mark);
    countStored(uid, through)
      .then((count) => {
        counted.add(mark);
        if (
          count >= STYLE_LEARN_EVERY &&
          !attempted.has(mark) &&
          !inFlight.has(uid)
        ) {
          run();
        }
      })
      .catch((error: unknown) => console.warn('Helm style count failed', error))
      .finally(() => counting.delete(mark));
  }, [isReady, uid, through, isDueInStore]);
}
