import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { readHabitClock } from '@apps/helm/engine/habitDay';
import { fromAwayKey, toAwayKey } from '@apps/helm/utils/planDays';

/** The moment, the habit day it belongs to and the zone that day follows (away spans included), moving each minute. */
export function useHabitClock() {
  const now = useNow(60_000);
  const profile = useAppSelector((state) => state.helm.profile);
  const awayKey = useAppSelector((state) => toAwayKey(state.helm.who.items));
  const clock = readHabitClock(
    now,
    {
      timeZone: profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC',
      zoneSpans: profile?.zoneSpans ?? [],
    },
    fromAwayKey(awayKey),
  );
  return { now, ...clock };
}
