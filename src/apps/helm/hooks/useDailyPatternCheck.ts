import { useEffect, useRef } from 'react';

import { useConnections } from '@/lib/connections/useConnections';
import { useAppSelector } from '@/store';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { runDailyPatternCheck } from '@apps/helm/store/actions/patternActions';
import {
  isPruneDue,
  pruneWeekly,
} from '@apps/helm/store/actions/retentionActions';

/** Once a day on open, after the habits, observations and reflections have loaded: notices patterns and offers at most one, and once a week cleans up what is old. Online only; each day is tried once per open, and a failure is tried again on the next open. */
export function useDailyPatternCheck(uid: string | null) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const profile = useAppSelector((state) => state.helm.profile);
  const habitsLoaded = useAppSelector((state) => state.helm.habits.isLoaded);
  const observationsLoaded = useAppSelector(
    (state) => state.helm.observations.isLoaded,
  );
  const projectsLoaded = useAppSelector(
    (state) => state.helm.projects.isLoaded,
  );
  const patternsLoaded = useAppSelector(
    (state) => state.helm.patterns.isLoaded,
  );
  const reflectionsLoaded = useAppSelector(
    (state) => state.helm.unseenReflections.isLoaded,
  );
  const { grants, isLoading: isGrantsLoading } = useConnections({
    readerAppId: 'helm',
  });
  const clock = useHabitClock();
  const tried = useRef('');
  const key = `${uid}:${clock.dayKey}`;
  const isReady =
    keyStatus === 'ready' &&
    !isGrantsLoading &&
    profile !== null &&
    habitsLoaded &&
    projectsLoaded &&
    patternsLoaded &&
    observationsLoaded &&
    reflectionsLoaded;
  const isDue =
    profile !== null &&
    ((profile.isLearningOn && profile.patternsCheckedOn !== clock.dayKey) ||
      profile.forgottenAt !== null ||
      isPruneDue(profile.prunedOn, clock.dayKey));

  useEffect(() => {
    if (!uid || !isReady || !isDue || tried.current === key) return;
    if (!navigator.onLine) return;
    tried.current = key;
    getHelmEncryption(uid)
      .then(async (encryption) => {
        await runDailyPatternCheck(uid, encryption, {
          todayKey: clock.dayKey,
          timeZone: clock.timeZone,
          grants,
        }).catch((error: unknown) =>
          console.error('Helm patterns were not checked', error),
        );
        if (isPruneDue(profile?.prunedOn ?? null, clock.dayKey))
          await pruneWeekly(uid, encryption, Date.now(), clock.dayKey);
      })
      .catch((error: unknown) =>
        console.error('Helm patterns were not checked', error),
      );
  }, [
    uid,
    isReady,
    isDue,
    key,
    clock.dayKey,
    clock.timeZone,
    grants,
    profile?.prunedOn,
  ]);
}
