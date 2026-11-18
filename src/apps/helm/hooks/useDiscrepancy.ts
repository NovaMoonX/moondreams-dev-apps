import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import type { SyncedRecord } from '@apps/helm/types';
import { findDiscrepancy } from '@apps/helm/utils/discrepancy';

/** The zone the person's clock times are read in: their profile's, else this device's. */
export function useCopyTimeZone() {
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  return profileZone ?? getDeviceTimeZone() ?? 'UTC';
}

/** The unanswered disagreement between an email's fact and this copy, or null. */
export function useDiscrepancy(record: SyncedRecord) {
  const facts = useAppSelector((state) => state.helm.facts.items);
  const timeZone = useCopyTimeZone();
  return findDiscrepancy(record, facts, timeZone);
}
