import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { readTodayZone, toDayKey } from '@apps/helm/utils/planDays';

/** Today's date in the zone today's clock follows (home, or an away span's), the planner's "today"; it moves at midnight there. */
export function useTodayKey() {
  const now = useNow(60_000);
  const profile = useAppSelector((state) => state.helm.profile);
  const homeZone = profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
  const zone = readTodayZone(now, {
    timeZone: homeZone,
    zoneSpans: profile?.zoneSpans ?? [],
  });
  return toDayKey(now, zone);
}
