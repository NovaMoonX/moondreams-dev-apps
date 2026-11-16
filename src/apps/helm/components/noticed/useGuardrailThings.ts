import { useMemo } from 'react';

import { store, useAppSelector } from '@/store';
import { toShortDay } from '@apps/helm/components/noticed/guardrailWords';
import { HELM_COPY } from '@apps/helm/constants';
import { isTimeReason, readNameable } from '@apps/helm/engine/guardrails';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import type { OpenPattern } from '@apps/helm/types';
import { buildGuardrailInput } from '@apps/helm/utils/guardrailInput';

const OTHERS_SHOWN = 3;

export interface GuardrailThingRef {
  collection: 'projects' | 'habits';
  id: string;
  name: string;
}

/** The name of what a guardrail is about, its own subject even after another thing was paused instead (a task's title for a task; '' while it can't be read). */
export const useGuardrailSubjectName = (pattern: OpenPattern) => {
  const { subject } = pattern;
  return useAppSelector((state) =>
    subject.collection === 'tasks'
      ? (state.helm.openTasks.items.find((item) => item.id === subject.id)
          ?.title ?? '')
      : ((subject.collection === 'habits'
          ? state.helm.habits.items
          : state.helm.projects.items
        ).find((item) => item.id === subject.id)?.name ?? ''),
  );
};

/** The name of the thing just started that a start-time guardrail is about ('' when it isn't one or can't be read). */
export const useGuardrailStartedName = (pattern: OpenPattern) =>
  useAppSelector((state) =>
    pattern.moment !== 'onStart' || pattern.subject.otherId === null
      ? ''
      : ([...state.helm.habits.items, ...state.helm.projects.items].find(
          (item) => item.id === pattern.subject.otherId,
        )?.name ?? ''),
  );

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
      hasTimeReason: pattern.reasons.some((reason) =>
        isTimeReason(reason.kind),
      ),
    })
      .slice(0, OTHERS_SHOWN)
      .map((thing) => ({
        collection: thing.kind === 'habit' ? 'habits' : 'projects',
        id: thing.id,
        name: thing.name,
      }));
  }, [pattern, clock.now, clock.dayKey, clock.timeZone, helm]);
}

export interface GuardrailDone {
  /** What the answer did ("Paused Stretch until Nov 19"). */
  line: string;
  name: string;
  /** The thing is still paused as the answer left it. */
  isUndoable: boolean;
}

/** What a yes did, for a guardrail the person accepted; null for any other pattern. */
export function useGuardrailDone(pattern: OpenPattern): GuardrailDone | null {
  const { effect } = pattern;
  const live = useAppSelector((state) =>
    effect.kind !== 'pause'
      ? null
      : ((effect.collection === 'habits'
          ? state.helm.habits.items
          : state.helm.projects.items
        ).find((item) => item.id === effect.id) ?? null),
  );
  if (
    effect.kind !== 'pause' ||
    pattern.state !== 'accepted' ||
    pattern.acceptedBy !== 'person' ||
    !live ||
    live.isUnreadable
  )
    return null;
  const date = toShortDay(effect.until);
  const isHold =
    pattern.subject.otherId !== null &&
    pattern.subject.otherId === pattern.subject.id &&
    effect.id === pattern.subject.id;
  return {
    line: isHold
      ? HELM_COPY.guardrailRowHeld(live.name, date)
      : HELM_COPY.guardrailRowPaused(live.name, date),
    name: live.name,
    isUndoable: live.status === 'paused' && live.pausedUntil === effect.until,
  };
}
