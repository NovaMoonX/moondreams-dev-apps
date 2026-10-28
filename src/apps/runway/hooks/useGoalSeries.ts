import { useAppSelector } from '@/store';
import { getEffectiveSplits } from '@apps/runway/engine/correct';
import { planGoalContributions } from '@apps/runway/engine/pace';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import {
  getPriorDays,
  selectComingDays,
  selectHeldByItem,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { GoalSealed } from '@apps/runway/types';
import { getGoalSeries } from '@apps/runway/utils/goalSeries';

export interface GoalSeriesTarget {
  goalId: string;
  goal: GoalSealed;
  today: number;
}

/** What the goal has held by date, and the path the plan puts it on to its target. */
export function useGoalSeries({ goalId, goal, today }: GoalSeriesTarget) {
  const heldCents = useAppSelector(selectHeldByItem)[goalId] ?? 0;
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const records = useAppSelector((state) => state.runway.records);
  const days = useAppSelector((state) => state.runway.days);
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const stance = useAppSelector(selectStance);
  const items = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);

  const arrivedOn = new Map(
    days.map((day) => [day.id, day.arrivedOn ?? day.expectedOn]),
  );
  const splits = getEffectiveSplits(
    records.filter(
      (record) =>
        startDate === null || (arrivedOn.get(record.dayId) ?? 0) >= startDate,
    ),
  ).map((split) => ({
    on: arrivedOn.get(split.dayId) ?? today,
    cents: split.lines
      .filter((line) => line.itemId === goalId)
      .reduce((sum, line) => sum + line.cents, 0),
  }));
  const isPlanned =
    goal.state !== 'paused' &&
    goal.funding.cadence.kind !== 'none' &&
    goal.funding.amount.kind !== 'rest';
  const contributions = isPlanned
    ? planGoalContributions(
        { ...goal, heldCents },
        comingDays.map((day) => ({
          ...day,
          moneyCents: pick(
            effectiveStance(stance, day.stanceOverride),
            day.amount,
            'income',
          ),
        })),
        getPriorDays(items, versions, today, comingDays, [goal.funding]),
      ).map((part) => ({ on: part.day.on, cents: part.cents }))
    : [];
  const result = getGoalSeries({
    heldCents,
    targetCents: goal.targetCents,
    targetDate: goal.targetDate,
    startDate,
    splits,
    contributions,
    today,
  });
  return result;
}
