import { queryOptions } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';

import { auth, functions, storage } from '@/lib/firebase/config';
import { SHARE_ID_LENGTH } from '@apps/pinch/constants';
import type { PinchShareResult } from '@apps/pinch/types';
import { getShareTarget } from '@apps/pinch/utils/importShare';

const SHARE_ID_PATTERN = new RegExp(`^[2-9a-hj-np-z]{${SHARE_ID_LENGTH}}$`);

export const isShareId = (value: string) => SHARE_ID_PATTERN.test(value);

const getPinchShareCallable = httpsCallable<
  { shareId: string },
  PinchShareResult
>(functions, 'getPinchShare');

export const shareQueryKeys = {
  all: ['pinch', 'shared'] as const,
  detail: (shareId: string, uid: string | null) =>
    [...shareQueryKeys.all, shareId, uid] as const,
  cover: (shareId: string, index: number) =>
    [...shareQueryKeys.all, 'cover', shareId, index] as const,
};

/** A token the server won't take answers even this public call with a 401, so the person's token is renewed and the call made once more. */
const readShare = async (shareId: string): Promise<PinchShareResult> => {
  try {
    return (await getPinchShareCallable({ shareId })).data;
  } catch (error) {
    if (
      !(error instanceof FirebaseError) ||
      error.code !== 'functions/unauthenticated'
    ) {
      throw error;
    }
    await auth.currentUser?.getIdToken(true);
    return (await getPinchShareCallable({ shareId })).data;
  }
};

const NOT_FOUND: PinchShareResult = { status: 'not_found' };

/** An answer that doesn't hold what its kind says reads as not found, so the page never draws half a recipe. */
const toShareResult = (data: PinchShareResult): PinchShareResult =>
  data.status === 'ok' && getShareTarget(data) !== null ? data : NOT_FOUND;

/**
 * What a link shows, read for whoever is signed in (the owner is told so). Never persisted: the result is someone's recipe and the key holds the link's secret.
 * An id that could not be one is answered as not found without asking.
 */
export function sharedPinchQueryOptions(shareId: string, uid: string | null) {
  return queryOptions({
    queryKey: shareQueryKeys.detail(shareId, uid),
    queryFn: async () => {
      if (!isShareId(shareId)) return NOT_FOUND;

      const result = await readShare(shareId);
      return toShareResult(result);
    },
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export const getSharedCoverPath = (shareId: string, index: number) =>
  `apps/pinch/shares/${shareId}/cover-${index}.webp`;

/** The download address of a shared cover, from our own Storage only. Not persisted, for the same reason. */
export function sharedCoverQueryOptions(shareId: string, index: number) {
  return queryOptions({
    queryKey: shareQueryKeys.cover(shareId, index),
    queryFn: () =>
      getDownloadURL(ref(storage, getSharedCoverPath(shareId, index))),
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
}
