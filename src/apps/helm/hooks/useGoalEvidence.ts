import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { createSealedReader } from '@lib/security';
import { DAY_MS } from '@apps/helm/constants';
import { selectGoalEvidence } from '@apps/helm/engine/goalEvidence';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { fetchHabitDays } from '@apps/helm/store/listeners/habitDayListener';
import { selectGoalHabits } from '@apps/helm/store/selectors/habitSelectors';

const WEEKS_BACK = 13;

/** The goal's progress line: its parts joined with " · ", or null while there is nothing to read. Twelve weeks of days are read once while the goal is open; the live days from the store cover the latest two weeks. */
export function useGoalEvidence(projectId: string): string | null {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { dayKey, timeZone } = useHabitClock();
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const habits = useAppSelector((state) => selectGoalHabits(state, projectId));
  const live = useAppSelector((state) => state.helm.habitDays.byId);
  const project = useAppSelector((state) =>
    state.helm.projects.items.find((item) => item.id === projectId),
  );
  const todayMs = Date.parse(`${dayKey}T00:00:00Z`);
  const earlier = useQuery({
    queryKey: ['helm', 'goalHabitDays', uid, projectId, dayKey],
    queryFn: async () =>
      Object.fromEntries(
        (
          await fetchHabitDays(
            uid ?? '',
            createSealedReader(await getHelmEncryption(uid ?? ''), openJson),
            {
              fromDate: todayMs - WEEKS_BACK * 7 * DAY_MS,
              toDate: todayMs + DAY_MS,
            },
          )
        ).map((entry) => [entry.id, entry]),
      ),
    enabled: uid !== null && keyStatus === 'ready' && habits.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (!project || project.isUnreadable) return null;
  if (habits.length > 0 && !earlier.data) return null;
  return selectGoalEvidence({
    habits,
    days: { ...(earlier.data ?? {}), ...live },
    milestoneState: project.milestoneState,
    milestones: project.milestones,
    todayKey: dayKey,
    timeZone,
  }).join(' · ');
}
