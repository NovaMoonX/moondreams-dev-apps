import { useAppSelector } from '@/store';
import { selectParentIndex } from '@apps/helm/store/selectors/privacySelectors';
import {
  readRecordPrivacy,
  type PrivacyRecord,
  type PrivateKind,
} from '@apps/helm/utils/privacyParents';

/** Whether a record is private in effect: its own mark, a care mark or a private parent, read from the store so a child whose rewrite has not landed still shows the lock. */
export function useIsPrivate(kind: PrivateKind, record: PrivacyRecord) {
  const index = useAppSelector(selectParentIndex);
  return readRecordPrivacy(kind, record, index) === 'private';
}
