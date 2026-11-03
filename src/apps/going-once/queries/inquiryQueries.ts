import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';

import { HANDLED_INBOX_LIMIT } from '@apps/going-once/constants';
import {
  inquiriesOf,
  toInquiry,
} from '@apps/going-once/store/listeners/inquiriesListener';
import type { Inquiry } from '@apps/going-once/types';

export interface HandledCursor {
  handledAt: number;
  id: string;
}

export const inquiryQueryKeys = {
  all: ['going-once', 'inquiries'] as const,
  olderHandled: (saleId: string) =>
    [...inquiryQueryKeys.all, 'olderHandled', saleId] as const,
  handledCount: (saleId: string) =>
    [...inquiryQueryKeys.all, 'handledCount', saleId] as const,
};

const readPage = async (
  saleId: string,
  cursor: HandledCursor | null,
): Promise<Inquiry[]> => {
  const handled = query(
    inquiriesOf(saleId),
    where('status', '==', 'HANDLED'),
    orderBy('handledAt', 'desc'),
  );
  const after =
    cursor === null ? null : await getDoc(doc(inquiriesOf(saleId), cursor.id));
  const snapshot = await getDocs(
    cursor === null
      ? query(handled, limit(HANDLED_INBOX_LIMIT))
      : query(
          handled,
          startAfter(after?.exists() ? after : cursor.handledAt),
          limit(HANDLED_INBOX_LIMIT),
        ),
  );
  return snapshot.docs.map((entry) =>
    toInquiry(entry.id, saleId, entry.data()),
  );
};

export const toHandledCursor = (
  inquiry: Inquiry | undefined,
): HandledCursor | null =>
  inquiry?.handledAt == null
    ? null
    : { handledAt: inquiry.handledAt, id: inquiry.id };

/** Handled inquiries in pages of 30 after `after` (the oldest the live listener shows), most recently handled first, continuing after the last document of the page before (a snapshot cursor, so ties on `handledAt` break by id and a page never repeats or skips one). */
export const olderHandledQueryOptions = (
  saleId: string,
  after: HandledCursor | null,
) =>
  infiniteQueryOptions({
    queryKey: inquiryQueryKeys.olderHandled(saleId),
    queryFn: ({ pageParam }) => readPage(saleId, pageParam),
    initialPageParam: after,
    getNextPageParam: (lastPage) =>
      lastPage.length < HANDLED_INBOX_LIMIT
        ? undefined
        : toHandledCursor(lastPage.at(-1)),
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
