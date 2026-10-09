import { queryOptions } from '@tanstack/react-query';

import { checkDocExistsOnServer } from '@/lib/firebase/localData';

export const membershipQueryKeys = {
  onServer: (uid: string) => ['a-list', 'membership-on-server', uid] as const,
};

// Not persisted and never reused: the point is a fresh answer that skips the SDK's saved state.
export function membershipOnServerQueryOptions(uid: string) {
  return queryOptions({
    queryKey: membershipQueryKeys.onServer(uid),
    queryFn: () => checkDocExistsOnServer(`apps/a-list/memberships/${uid}`),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}
