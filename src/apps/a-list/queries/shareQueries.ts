import { queryOptions } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';
import type { SharedCalendarResult } from '@apps/a-list/types';

const getCalendarShareCallable = httpsCallable<
  { shareId: string; pin: string | null },
  SharedCalendarResult
>(functions, 'getCalendarShare');

export const shareQueryKeys = {
  all: ['a-list', 'shared-calendar'] as const,
  detail: (shareId: string, pin: string | null) =>
    [...shareQueryKeys.all, shareId, pin] as const,
};

// Never persisted: the result is someone's calendar and the key can hold their PIN.
export function sharedCalendarQueryOptions(shareId: string, pin: string | null) {
  return queryOptions({
    queryKey: shareQueryKeys.detail(shareId, pin),
    queryFn: async () => {
      const result = await getCalendarShareCallable({ shareId, pin });
      return result.data;
    },
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
  });
}
