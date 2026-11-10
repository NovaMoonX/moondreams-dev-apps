import { useAppSelector } from '@/store';
import type { SyncedRecord } from '@apps/helm/types';
import { findDiscrepancy } from '@apps/helm/utils/discrepancy';

/** The unanswered disagreement between an email's fact and this copy, or null. */
export function useDiscrepancy(record: SyncedRecord) {
  const facts = useAppSelector((state) => state.helm.facts.items);
  return findDiscrepancy(record, facts);
}
