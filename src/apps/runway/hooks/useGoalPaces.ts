import { useMemo } from 'react';

import { useAppSelector } from '@/store';
import { getGoalPaceStretches } from '@apps/runway/engine/goalTimeline';
import { getTimelinePace, getTimelineTrack } from '@apps/runway/engine/pace';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import {
  getGoalPaceDial,
  getGoalPaceFunding,
  usePriorityDial,
} from '@apps/runway/hooks/usePriorityDial';
import {
  getPriorDays,
  selectComingDays,
  selectGoals,
  selectHeldByItem,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';

/** Every goal with the pace the plan's coming income days give it, at the priority dial the person has set. */
export function useGoalPaces(today: number) {
  const goals = useAppSelector((state) => selectGoals(state, today));
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const stance = useAppSelector(selectStance);
  const heldByItem = useAppSelector(selectHeldByItem);
  const items = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);
  const { dial } = usePriorityDial();

  return useMemo(() => {
    const paceStretchesByGoal = goals.map(({ item }) =>
      getGoalPaceStretches(versions, item, today, (goal) =>
        getGoalPaceFunding(goal, dial),
      ),
    );
    const priorDays = getPriorDays(
      items,
      versions,
      today,
      comingDays,
      paceStretchesByGoal.flatMap((stretches) =>
        stretches.map(({ goal }) => goal.funding),
      ),
    );
    const incomeDays = comingDays.map((day) => ({
      ...day,
      moneyCents: pick(
        effectiveStance(stance, day.stanceOverride),
        day.amount,
        'income',
      ),
    }));
    return goals.map(({ item, version }, index) => {
      const paceStretches = paceStretchesByGoal[index];
      const pace = getTimelinePace(
        paceStretches,
        heldByItem[item.id] ?? 0,
        incomeDays,
        priorDays,
        version.payload,
      );
      return {
        item,
        payload: version.payload,
        paceDial: getGoalPaceDial(version.payload, dial),
        pace,
        isSavingAhead: paceStretches.some((stretch) => stretch.isSaving),
        track: getTimelineTrack(pace),
      };
    });
  }, [goals, comingDays, stance, heldByItem, items, versions, today, dial]);
}
