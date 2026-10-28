import { queryOptions } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';
import { DAY_MS } from '@/lib/query/queryClient';
import { normalizeString } from '@/utils/stringUtils';
import { SHOWTIMES_STALE_MS } from '@apps/a-list/constants';
import type { ShowtimeOption, TicketPriceKind } from '@apps/a-list/types';
import { applyTicketPriceKind } from '@apps/a-list/utils/ticketPrice';

export interface ShowtimeSearch {
  theatreId: string;
  /** The viewer's local day, "YYYY-MM-DD". */
  date: string;
  title: string;
}

const findShowtimesCallable = httpsCallable<
  ShowtimeSearch,
  { showtimes: ShowtimeOption[] }
>(functions, 'findShowtimes');

export const showtimeQueryKeys = {
  all: ['a-list', 'showtimes'] as const,
  find: (search: ShowtimeSearch) =>
    [
      ...showtimeQueryKeys.all,
      'v3',
      search.theatreId,
      search.date,
      normalizeString(search.title),
    ] as const,
};

// Prices and sold-out flags move through the day, so this is neither cached long nor persisted.
export function findShowtimesQueryOptions(
  search: ShowtimeSearch,
  priceKind: TicketPriceKind,
) {
  return queryOptions({
    queryKey: showtimeQueryKeys.find(search),
    queryFn: async () => {
      const result = await findShowtimesCallable({
        ...search,
        title: search.title.trim(),
      });
      return result.data.showtimes;
    },
    select: (showtimes) =>
      showtimes.map((option) => applyTicketPriceKind(option, priceKind)),
    staleTime: SHOWTIMES_STALE_MS,
    gcTime: DAY_MS,
    retry: false,
  });
}
