import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { selectOpenTasksById } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenExecution } from '@apps/helm/types';
import { buildResultLines } from '@apps/helm/utils/resultLines';

/** One line per change an execution made, in the person's time zone. */
export function useResultLines(execution: OpenExecution) {
  const now = useNow(60_000);
  const tasksById = useAppSelector(selectOpenTasksById);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  return buildResultLines(execution, tasksById, timeZone, now);
}
