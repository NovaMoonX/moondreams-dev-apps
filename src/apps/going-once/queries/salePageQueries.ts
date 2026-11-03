import { queryOptions } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';

import { auth, functions } from '@/lib/firebase/config';
import { SALE_LINK_ID_PATTERN } from '@apps/going-once/constants';
import type {
  InterestRequest,
  InterestResult,
  SalePageResult,
} from '@apps/going-once/types';

const getSalePageCallable = httpsCallable<{ linkId: string }, SalePageResult>(
  functions,
  'getSalePage',
);

const submitSaleInterestCallable = httpsCallable<
  InterestRequest,
  InterestResult
>(functions, 'submitSaleInterest');

const NOT_FOUND: SalePageResult = { status: 'not_found' };

export const salePageQueryKeys = {
  all: ['going-once', 'salePage'] as const,
  detail: (linkId: string, uid: string | null) =>
    [...salePageQueryKeys.all, linkId, uid] as const,
};

/** A token the server won't take answers even a public call with a 401, so the person's token is renewed and the call made once more. */
const callOnceRenewed = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    if (
      !(error instanceof FirebaseError) ||
      error.code !== 'functions/unauthenticated'
    ) {
      throw error;
    }
    await auth.currentUser?.getIdToken(true);
    return call();
  }
};

const readPage = (linkId: string): Promise<SalePageResult> =>
  callOnceRenewed(async () => (await getSalePageCallable({ linkId })).data);

/** A buyer's interest in a thing; every refusal comes back as a status, and only a failed call throws. */
export const sendInterest = (
  request: InterestRequest,
): Promise<InterestResult> =>
  callOnceRenewed(async () => (await submitSaleInterestCallable(request)).data);

/**
 * What a link shows now, read for whoever is signed in (a member is told so). The page is live: fresh for 30 seconds and read again when the person comes back to the tab.
 * Never persisted: the key holds the link's secret. An id that could not be one is answered as not found without asking.
 */
export function salePageQueryOptions(linkId: string, uid: string | null) {
  return queryOptions({
    queryKey: salePageQueryKeys.detail(linkId, uid),
    queryFn: async () => {
      if (!SALE_LINK_ID_PATTERN.test(linkId)) return NOT_FOUND;

      const result = await readPage(linkId);
      return result.status === 'ok' ? result : NOT_FOUND;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
