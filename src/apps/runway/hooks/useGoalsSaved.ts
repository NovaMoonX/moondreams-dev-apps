import { useAppSelector } from '@/store';
import {
  isCountedAt,
  usePriorityDial,
} from '@apps/runway/hooks/usePriorityDial';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectGoals } from '@apps/runway/store/selectors/runwaySelectors';

/** What the goals counted at the dial hold against what they aim for, the one figure the Goals header and the overview's Goals tile share. */
export function useGoalsSaved(today: number) {
  const { dial } = usePriorityDial();
  const goals = useAppSelector((state) => selectGoals(state, today));
  const assignedByItem = useAppSelector(selectBalances).assignedByItem;
  const counted = goals.filter(({ version }) =>
    isCountedAt(version.payload.priority, dial),
  );
  return {
    savedCents: counted.reduce(
      (sum, { item }) => sum + Math.max(0, assignedByItem[item.id] ?? 0),
      0,
    ),
    targetCents: counted.reduce(
      (sum, { version }) => sum + version.payload.targetCents,
      0,
    ),
    hasTargets: goals.some(({ version }) => version.payload.targetCents > 0),
    hasGoals: goals.length > 0,
  };
}
