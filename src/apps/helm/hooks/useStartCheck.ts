import { useEffect, useRef } from 'react';

import { useConnections } from '@/lib/connections/useConnections';
import { useAppSelector } from '@/store';
import type { GuardrailRecord } from '@apps/helm/engine/guardrails';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { runStartCheck } from '@apps/helm/store/actions/guardrailActions';

const RECENT_MS = 60_000;

/** When a project, goal, habit or task with a date arrives in what is loaded within a minute of being made, weighs it once for a guardrail. What was already there when Helm opened is never weighed, and one that arrives with no connection is not weighed later. */
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
  const clock = useHabitClock();
  const seen = useRef<Set<string> | null>(null);
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
    const records = [
      ...projects.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        createdAt: item.createdAt,
      })),
      ...habits.items.map((item) => ({
        id: item.id,
        kind: 'habit' as const,
        createdAt: item.createdAt,
      })),
      ...tasks.items.flatMap((item) =>
        item.due === null
          ? []
          : [{ id: item.id, kind: 'task' as const, createdAt: item.createdAt }],
      ),
    ];
    const known = seen.current;
    seen.current = new Set(records.map((item) => item.id));
    if (known === null) return;
    const now = Date.now();
    const [arrived]: GuardrailRecord[] = records
      .filter(
        (item) => !known.has(item.id) && now - item.createdAt <= RECENT_MS,
      )
      .map(({ id, kind }) => ({ id, kind }));
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
    grants,
    clock.dayKey,
    clock.timeZone,
  ]);
}
