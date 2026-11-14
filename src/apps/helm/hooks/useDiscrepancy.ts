import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import type { SyncedRecord } from '@apps/helm/types';
import { findDiscrepancy } from '@apps/helm/utils/discrepancy';
import {
  fromAwayKey,
  readTodayZone,
  toAwayKey,
} from '@apps/helm/utils/planDays';

/** The zone the person's clock times are read in: their profile's, else this device's. */
export function useCopyTimeZone() {
  const profile = useAppSelector((state) => state.helm.profile);
  const awayKey = useAppSelector((state) => toAwayKey(state.helm.who.items));
  const now = useNow(60_000);
  return readTodayZone(now, {
    timeZone: profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC',
    zoneSpans: profile?.zoneSpans ?? [],
  }, fromAwayKey(awayKey));
}

/** The unanswered disagreement between an email's fact and this copy, or null. */
export function useDiscrepancy(record: SyncedRecord) {
  const facts = useAppSelector((state) => state.helm.facts.items);
  const timeZone = useCopyTimeZone();
  return findDiscrepancy(record, facts, timeZone);
}
