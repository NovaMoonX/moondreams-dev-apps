import { useAppSelector } from '@/store';
import { getEffectiveSplits } from '@apps/runway/engine/correct';
import { collectTransferEntries } from '@apps/runway/engine/progress';
import { getGoalPaceStretches } from '@apps/runway/engine/goalTimeline';
import { planGoalTimeline } from '@apps/runway/engine/pace';
import {
  getGoalPaceFunding,
  usePriorityDial,
} from '@apps/runway/hooks/usePriorityDial';
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
  const moves = useAppSelector((state) => state.runway.moves);
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const stance = useAppSelector(selectStance);
  const items = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);
  const { dial } = usePriorityDial();

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
  const moved = collectTransferEntries(moves, startDate).flatMap((entry) => [
    ...(entry.toId === goalId ? [{ on: entry.on, cents: entry.cents }] : []),
    ...(entry.fromId === goalId ? [{ on: entry.on, cents: -entry.cents }] : []),
  ]);
  const header = items.find((item) => item.id === goalId);
  const paceStretches = header
    ? getGoalPaceStretches(versions, header, today, (payload) =>
        getGoalPaceFunding(payload, dial),
      )
    : [];
  const contributions = planGoalTimeline(
    paceStretches,
    heldCents,
    comingDays.map((day) => ({
      ...day,
      moneyCents: pick(
        effectiveStance(stance, day.stanceOverride),
        day.amount,
        'income',
      ),
    })),
    getPriorDays(
      items,
      versions,
      today,
      comingDays,
      paceStretches.map(({ goal: stretchGoal }) => stretchGoal.funding),
    ),
  ).contributions.map((part) => ({ on: part.day.on, cents: part.cents }));
  const end = paceStretches.at(-1)?.goal ?? goal;
  const result = getGoalSeries({
    heldCents,
    targetCents: end.targetCents,
    targetDate: end.targetDate,
    startDate,
    splits: [...splits, ...moved],
    contributions,
    today,
  });
  return result;
}
