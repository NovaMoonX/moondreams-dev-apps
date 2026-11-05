import { useAppSelector } from '@/store';
import { isSavingFor } from '@apps/runway/engine/pace';
import {
  isCountedAt,
  usePriorityDial,
} from '@apps/runway/hooks/usePriorityDial';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectGoals } from '@apps/runway/store/selectors/runwaySelectors';

/** What the goals being saved for, counted at the dial, hold against what they aim for: the one figure the Goals header and the overview's Goals tile share. */
export function useGoalsSaved(today: number) {
  const { dial } = usePriorityDial();
  const goals = useAppSelector((state) => selectGoals(state, today));
  const assignedByItem = useAppSelector(selectBalances).assignedByItem;
  const atDial = goals.filter(({ version }) =>
    isCountedAt(version.payload.priority, dial),
  );
  const counted = atDial.filter(({ version }) => isSavingFor(version.payload));
  return {
    savedCents: counted.reduce(
      (sum, { item }) => sum + Math.max(0, assignedByItem[item.id] ?? 0),
      0,
    ),
    targetCents: counted.reduce(
      (sum, { version }) => sum + version.payload.targetCents,
      0,
    ),
    notSavingCount: atDial.length - counted.length,
    hasTargets: goals.some(
      ({ version }) =>
        isSavingFor(version.payload) && version.payload.targetCents > 0,
    ),
    hasGoals: goals.length > 0,
  };
}
