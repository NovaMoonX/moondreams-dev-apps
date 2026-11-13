import { useAppSelector } from '@/store';
import { isSavingFor } from '@apps/runway/engine/pace';
import {
  isCountedAt,
  usePriorityDial,
} from '@apps/runway/hooks/usePriorityDial';
import { selectBalances } from '@apps/runway/store/selectors/billCoverSelectors';
import { selectGoals } from '@apps/runway/store/selectors/runwaySelectors';

/** What every goal counted at the dial holds against what it aims for (money held is saved whether or not more goes in), and how many get nothing put in: the one figure the Goals header and the overview's Goals tile share. */
export function useGoalsSaved(today: number) {
  const { dial } = usePriorityDial();
  const goals = useAppSelector((state) => selectGoals(state, today));
  const assignedByItem = useAppSelector(selectBalances).assignedByItem;
  const atDial = goals.filter(({ version }) =>
    isCountedAt(version.payload.priority, dial),
  );
  const savingCount = atDial.filter(({ version }) =>
    isSavingFor(version.payload),
  ).length;
  return {
    savedCents: atDial.reduce(
      (sum, { item, version }) =>
        sum +
        Math.min(
          Math.max(0, assignedByItem[item.id] ?? 0),
          version.payload.targetCents,
        ),
      0,
    ),
    targetCents: atDial.reduce(
      (sum, { version }) => sum + version.payload.targetCents,
      0,
    ),
    notSavingCount: atDial.length - savingCount,
    hasTargets: atDial.some(({ version }) => version.payload.targetCents > 0),
    hasGoals: goals.length > 0,
  };
}
