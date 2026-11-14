import { Lock } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';
import { useIsPrivate } from '@apps/helm/hooks/useIsPrivate';
import type {
  PrivacyRecord,
  PrivateKind,
} from '@apps/helm/utils/privacyParents';

interface PrivateLockProps {
  kind: PrivateKind;
  record: PrivacyRecord;
}

/** The quiet mark after a private thing's name in a list; "Private" is its accessible name. */
function PrivateLock({ kind, record }: PrivateLockProps) {
  const isPrivate = useIsPrivate(kind, record);
  if (!isPrivate) return null;
  return (
    <Lock
      className='text-muted-foreground ml-1 inline size-3 align-baseline'
      role='img'
      aria-label={HELM_COPY.privateLockLabel}
    />
  );
}

export default PrivateLock;

/** The same mark for a row that already knows its thing is private. */
export function PrivateLockMark() {
  return (
    <Lock
      className='text-muted-foreground ml-1 inline size-3 align-baseline'
      role='img'
      aria-label={HELM_COPY.privateLockLabel}
    />
  );
}
