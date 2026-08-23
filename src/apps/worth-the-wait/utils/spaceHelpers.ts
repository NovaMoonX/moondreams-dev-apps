import { User } from 'firebase/auth';
import { Space } from '../types';

export function getPartnerUid(
  space: Space | null,
  user: User | null,
): string | null {
  const activePartnerUid =
    user && space
      ? (space.members.find((memberUid) => memberUid !== user.uid) ?? null)
      : null;
  const partnerUid = activePartnerUid ?? space?.pendingMember?.uid ?? null;
  return partnerUid;
}
