import { useMemo } from 'react';

import { useAppSelector } from '@/store';
import { getGoalTrack, getPace } from '@apps/runway/engine/pace';
import { fundingAtLevel, getExtras } from '@apps/runway/engine/parts';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import {
  isCountedAt,
  usePriorityDial,
} from '@apps/runway/hooks/usePriorityDial';
import {
  getPriorDays,
  selectComingDays,
  selectGoals,
  selectHeldByItem,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { GoalSealed, Priority } from '@apps/runway/types';

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
    const priorDays = getPriorDays(
      items,
      versions,
      today,
      comingDays,
      goals.map(({ version }) => version.payload.funding),
    );
    /** The dial a goal's finish date is counted at: only a counted goal with an extra the dial leaves out moves. */
    const getPaceDial = (goal: GoalSealed): Priority | null => {
      if (dial === 'want' || !isCountedAt(goal.priority, dial)) return null;
      const isTrimmed = getExtras(goal).some(
        (extra) => !isCountedAt(extra.tier, dial),
      );
      return isTrimmed ? dial : null;
    };
    const getPaceFunding = (goal: GoalSealed) => {
      const paceDial = getPaceDial(goal);
      return paceDial === null
        ? {}
        : {
            funding: fundingAtLevel(goal, paceDial) ?? goal.funding,
            extras: null,
          };
    };
    const incomeDays = comingDays.map((day) => ({
      ...day,
      moneyCents: pick(
        effectiveStance(stance, day.stanceOverride),
        day.amount,
        'income',
      ),
    }));
    return goals.map(({ item, version }) => {
      const pace = getPace(
        {
          ...version.payload,
          ...getPaceFunding(version.payload),
          heldCents: heldByItem[item.id] ?? 0,
        },
        incomeDays,
        priorDays,
      );
      return {
        item,
        payload: version.payload,
        paceDial: getPaceDial(version.payload),
        pace,
        track: getGoalTrack(version.payload, pace),
      };
    });
  }, [goals, comingDays, stance, heldByItem, items, versions, today, dial]);
}
