import { useEffect, useRef } from 'react';

import { useConnections } from '@/lib/connections/useConnections';
import { useAppSelector } from '@/store';
import {
  pickStarted,
  type GuardrailRecord,
} from '@apps/helm/engine/guardrails';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { runStartCheck } from '@apps/helm/store/actions/guardrailActions';
import { wasCreatedHere } from '@apps/helm/utils/createdHere';

/** Weighs a record made on this device once it arrives, for a start-time guardrail. */
export function useStartCheck(uid: string | null) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const profile = useAppSelector((state) => state.helm.profile);
  const projects = useAppSelector((state) => state.helm.projects);
  const habits = useAppSelector((state) => state.helm.habits);
  const tasks = useAppSelector((state) => state.helm.openTasks);
  const patternsLoaded = useAppSelector(
    (state) => state.helm.patterns.isLoaded,
  );
  const { grants, isLoading: isGrantsLoading } = useConnections({
    readerAppId: 'helm',
  });
  const executions = useAppSelector(
    (state) => state.helm.recentExecutions.items,
  );
  const clock = useHabitClock();
  const seen = useRef<{
    uid: string;
    atLoad: Set<string>;
    weighed: Set<string>;
  } | null>(null);
  const isReady =
    uid !== null &&
    keyStatus === 'ready' &&
    profile !== null &&
    !isGrantsLoading &&
    patternsLoaded &&
    projects.isLoaded &&
    habits.isLoaded &&
    tasks.isLoaded;

  useEffect(() => {
    if (!uid || !isReady) return;
    const records: GuardrailRecord[] = [
      ...projects.items.map((item) => ({
        id: item.id,
        kind: item.kind,
      })),
      ...habits.items.map((item) => ({
        id: item.id,
        kind: 'habit' as const,
      })),
      ...tasks.items.flatMap((item) =>
        item.due === null ? [] : [{ id: item.id, kind: 'task' as const }],
      ),
    ];
    if (seen.current?.uid !== uid) {
      seen.current = {
        uid,
        atLoad: new Set(records.map((item) => item.id)),
        weighed: new Set(),
      };
      return;
    }
    const { atLoad, weighed } = seen.current;
    const madeByTurn = new Set(
      executions
        .filter(
          (entry) =>
            entry.via === null &&
            entry.captureId !== null &&
            wasCreatedHere(entry.captureId),
        )
        .flatMap((entry) => entry.effectRefs.map((ref) => ref.docId)),
    );
    const fresh = records.filter(
      (item) =>
        !atLoad.has(item.id) &&
        !weighed.has(item.id) &&
        (wasCreatedHere(item.id) || madeByTurn.has(item.id)),
    );
    fresh.forEach((item) => weighed.add(item.id));
    const arrived = pickStarted(fresh);
    if (!arrived) return;
    getHelmEncryption(uid)
      .then((encryption) =>
        runStartCheck(uid, encryption, arrived, {
          todayKey: clock.dayKey,
          timeZone: clock.timeZone,
          grants,
        }),
      )
      .catch((error: unknown) =>
        console.error('Helm did not weigh what was started', error),
      );
  }, [
    uid,
    isReady,
    projects.items,
    habits.items,
    tasks.items,
    executions,
    grants,
    clock.dayKey,
    clock.timeZone,
  ]);
}
