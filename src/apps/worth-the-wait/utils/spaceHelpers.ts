import { User } from 'firebase/auth';
import { PendingMember, Space } from '../types';

export function getPartnerUid(
  space: Space | null,
  user: User | null,
  pendingMember?: PendingMember | null,
): string | null {
  const activePartnerUid =
    user && space
      ? (space.members.find((memberUid) => memberUid !== user.uid) ?? null)
      : null;
  const partnerUid = activePartnerUid ?? pendingMember?.uid ?? null;
  return partnerUid;
}
