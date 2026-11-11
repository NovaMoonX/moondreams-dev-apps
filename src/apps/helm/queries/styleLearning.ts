import { useEffect } from 'react';

import { useMutation } from '@tanstack/react-query';
import {
  collection,
  getDocs,
  limit,
  orderBy,
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

/** Persons whose call is out, and the "uid|through" marks already tried this session, so renders and a second look at the same count never call twice. A second tab is turned away by the server's `busy`. */
const inFlight = new Set<string>();
const attempted = new Set<string>();
/** Marks whose stored count was read once this session; the store's windows keep watching after that. */
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
  const snapshot = await getDocs(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'captures'),
      where('createdAt', '>', through ?? 0),
      orderBy('createdAt', 'desc'),
      limit(STYLE_LEARN_EVERY * 4),
    ),
  );
  return snapshot.docs.filter((entry) => entry.data().inputMode === 'typed')
    .length;
}

/** After every 25 new typed messages, asks the server once, in the background, to learn the person's writing style. Voice is never counted; a failure is only logged. */
export function useStyleLearning(uid: string | null) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const profile = useAppSelector((state) =>
    state.helm.uid === uid ? state.helm.profile : null,
  );
  const captures = useAppSelector(selectAllCaptures);
  const mutation = useMutation({
    mutationFn: async () => (await learnHelmStyleCallable({})).data,
    onError: (error) => console.warn('Helm style learning failed', error),
  });
  const { mutate } = mutation;
  const isReady = uid !== null && keyStatus === 'ready' && profile !== null;
  const through = profile?.styleLearnedThroughAt ?? null;
  const isDueInStore = countLoaded(captures, through) >= STYLE_LEARN_EVERY;

  useEffect(() => {
    if (!isReady || !uid) return;
    const mark = `${uid}|${through ?? ''}`;
    if (attempted.has(mark) || inFlight.has(uid)) return;
    const run = () => {
      attempted.add(mark);
      inFlight.add(uid);
      mutate(undefined, { onSettled: () => inFlight.delete(uid) });
    };
    if (isDueInStore) {
      run();
      return;
    }
    if (counted.has(mark)) return;
    let isCurrent = true;
    countStored(uid, through)
      .then((count) => {
        counted.add(mark);
        if (isCurrent && count >= STYLE_LEARN_EVERY) run();
      })
      .catch((error: unknown) =>
        console.warn('Helm style count failed', error),
      );
    return () => {
      isCurrent = false;
    };
  }, [isReady, uid, through, isDueInStore, mutate]);
}
