import { useMemo } from 'react';

import { store, useAppSelector } from '@/store';
import { readNameable } from '@apps/helm/engine/guardrails';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import type { OpenPattern } from '@apps/helm/types';
import { buildGuardrailInput } from '@apps/helm/utils/guardrailInput';

const OTHERS_SHOWN = 3;

export interface GuardrailThingRef {
  collection: 'projects' | 'habits';
  id: string;
  name: string;
}

/** The name of what a guardrail suggests pausing ('' while it can't be read). */
export const useGuardrailSubjectName = (pattern: OpenPattern) => {
  const { effect } = pattern;
  return useAppSelector((state) =>
    effect.kind !== 'pause'
      ? ''
      : ((effect.collection === 'habits'
          ? state.helm.habits.items
          : state.helm.projects.items
        ).find((item) => item.id === effect.id)?.name ?? ''),
  );
};

/** The other things a guardrail could pause, lowest-placed first (at most three), with no calendar read. */
export function useGuardrailOthers(pattern: OpenPattern | null) {
  const clock = useHabitClock();
  const helm = useAppSelector((state) => state.helm);
  return useMemo((): GuardrailThingRef[] => {
    if (!pattern || pattern.effect.kind !== 'pause') return [];
    const own = pattern.effect.id;
    const refOf = (kind: OpenPattern['reasons'][number]['kind']) => {
      const evidence = pattern.reasons.find(
        (reason) => reason.kind === kind,
      )?.evidence;
      return evidence?.kind === 'load' ? evidence.refs[0] : null;
    };
    const input = buildGuardrailInput({
      state: { ...store.getState(), helm },
      now: clock.now,
      todayKey: clock.dayKey,
      timeZone: clock.timeZone,
      grants: [],
      days: {},
    });
    return readNameable(input, {
      starvedId: refOf('starved'),
      leaveOut: [own, refOf('deadlineWontFit') ?? ''],
    })
      .slice(0, OTHERS_SHOWN)
      .map((thing) => ({
        collection: thing.kind === 'habit' ? 'habits' : 'projects',
        id: thing.id,
        name: thing.name,
      }));
  }, [pattern, clock.now, clock.dayKey, clock.timeZone, helm]);
}
