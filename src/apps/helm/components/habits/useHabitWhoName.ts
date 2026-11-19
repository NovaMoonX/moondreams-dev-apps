import { useAppSelector } from '@/store';
import { selectWhoById } from '@apps/helm/store/selectors/whoSelectors';
import type { OpenHabit } from '@apps/helm/types';

/** The name of the person a care habit is for, or null when it is the person's own or the name can't be read. */
export function useHabitWhoName(habit: Pick<OpenHabit, 'forWhoId'>) {
  const who = useAppSelector(selectWhoById);
  const found = habit.forWhoId === null ? null : who.get(habit.forWhoId);
  return found && !found.isUnreadable && !found.isSelf ? found.name : null;
}
