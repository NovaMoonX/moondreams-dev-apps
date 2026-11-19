import { useAppSelector } from '@/store';
import { dayKeyToMs } from '@/utils/cadenceUtils';
import { formatDateShort } from '@/utils/formatUtils';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
import {
  selectImportanceGroups,
  selectImportanceItems,
  selectImportanceOrder,
} from '@apps/helm/store/selectors/importanceSelectors';
import { readPlaceWords } from '@apps/helm/utils/importanceWords';
import { formatWeekdayDayUTC } from '@apps/helm/utils/taskDue';

/** Today as the order reads it: a date-only UTC midnight in the zone today's clock follows. */
export const useImportanceToday = () => dayKeyToMs(useTodayKey());

/** One thing's place in what matters most, in words, for its own page; null when it is not in the order. */
export function useImportancePlace(id: string) {
  const today = useImportanceToday();
  const order = useAppSelector((state) => selectImportanceOrder(state, today));
  const groups = useAppSelector((state) =>
    selectImportanceGroups(state, today),
  );
  const items = useAppSelector(selectImportanceItems);
  const projects = useAppSelector((state) => state.helm.projects.items);
  const habits = useAppSelector((state) => state.helm.habits.items);

  return readPlaceWords({
    order,
    items,
    id,
    underGoalIds: groups.underGoalIds,
    emojiOf: (otherId) =>
      (
        projects.find((project) => project.id === otherId) ??
        habits.find((habit) => habit.id === otherId)
      )?.emoji ?? null,
    formatSaid: formatDateShort,
    formatDay: formatWeekdayDayUTC,
  });
}
