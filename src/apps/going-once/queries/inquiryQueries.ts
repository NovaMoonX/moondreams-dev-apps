import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  startAt,
  where,
} from 'firebase/firestore';

import { HANDLED_INBOX_LIMIT } from '@apps/going-once/constants';
import {
  inquiriesOf,
  toInquiry,
} from '@apps/going-once/store/listeners/inquiriesListener';
import type { Inquiry } from '@apps/going-once/types';

export const inquiryQueryKeys = {
  all: ['going-once', 'inquiries'] as const,
  olderHandled: (saleId: string) =>
    [...inquiryQueryKeys.all, 'olderHandled', saleId] as const,
  handledCount: (saleId: string) =>
    [...inquiryQueryKeys.all, 'handledCount', saleId] as const,
};

/** Where a page starts: the `handledAt` of the last row of the page before (that row and any tie are read again and dropped by id), or `null` for the top. */
type HandledPageStart = { handledAt: number; isPastTies: boolean } | null;

const readPage = async (
  saleId: string,
  start: HandledPageStart,
): Promise<Inquiry[]> => {
  const handled = query(
    inquiriesOf(saleId),
    where('status', '==', 'HANDLED'),
    orderBy('handledAt', 'desc'),
  );
  const snapshot = await getDocs(
    start === null
      ? query(handled, limit(2 * HANDLED_INBOX_LIMIT))
      : query(
          handled,
          start.isPastTies
            ? startAfter(start.handledAt)
            : startAt(start.handledAt),
          limit(HANDLED_INBOX_LIMIT),
        ),
  );
  return snapshot.docs.map((entry) =>
    toInquiry(entry.id, saleId, entry.data()),
  );
};

const getNextStart = (page: Inquiry[]): HandledPageStart | undefined => {
  const last = page.at(-1)?.handledAt;
  if (page.length < HANDLED_INBOX_LIMIT || last == null) return undefined;
  return {
    handledAt: last,
    isPastTies: page.every((inquiry) => inquiry.handledAt === last),
  };
};

/**
 * Every Handled inquiry, most recently handled first, read from the top in value-cursor pages (the first two pages' worth at once, since the live listener already shows the newest 30).
 * Each page starts at the last page's oldest `handledAt` inclusive, so a row handled, reopened or deleted meanwhile never opens a gap; the Inbox drops repeats by id.
 */
export const olderHandledQueryOptions = (saleId: string) =>
  infiniteQueryOptions({
    queryKey: inquiryQueryKeys.olderHandled(saleId),
    queryFn: ({ pageParam }) => readPage(saleId, pageParam),
    initialPageParam: null as HandledPageStart,
    getNextPageParam: getNextStart,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

/** How many Handled inquiries the sale holds, counted on the server. */
export const handledCountQueryOptions = (saleId: string) =>
  queryOptions({
    queryKey: inquiryQueryKeys.handledCount(saleId),
    queryFn: async () =>
      (
        await getCountFromServer(
          query(inquiriesOf(saleId), where('status', '==', 'HANDLED')),
        )
      ).data().count,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
