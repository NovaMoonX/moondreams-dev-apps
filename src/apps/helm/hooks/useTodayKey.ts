import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { toDayKey } from '@apps/helm/utils/planDays';

/** Today's date in the profile's zone, the planner's "today"; it moves at midnight there. */
export function useTodayKey() {
  const now = useNow(60_000);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  return toDayKey(now, profileZone ?? getDeviceTimeZone() ?? 'UTC');
}
