import { db } from '@lib/firebase/config';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Box, Item, MemberUpdateSummary } from '../types';
import {
  calculateMemberUpdateSummary,
  hasMemberUpdateSummary,
  normalizeMemberUpdateSummary,
} from '../utils/memberUpdates';

const AUTO_DISMISS_MS = 24 * 60 * 60 * 1000;

function getMemberUpdateDocRef(spaceId: string, userId: string) {
  return doc(
    db,
    'apps',
    'worth-the-wait',
    'spaces',
    spaceId,
    'memberUpdates',
    userId,
  );
}

function createZeroMemberUpdateSummary(
  userId: string,
  lastSurfacedAt = Date.now(),
): MemberUpdateSummary {
  return {
    userId,
    createdBoxes: 0,
    updatedBoxes: 0,
    newItems: 0,
    lastSurfacedAt,
    updatedAt: Date.now(),
  };
}

export function useMemberUpdates(
  spaceId: string,
  userId: string,
  boxes: Box[] = [],
  items: Item[] = [],
) {
  const [memberUpdate, setMemberUpdate] = useState<MemberUpdateSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(spaceId && userId));
  const [error, setError] = useState<string | null>(null);

  const persistMemberUpdate = useCallback(
    async (nextSummary: MemberUpdateSummary) => {
      if (!spaceId || !userId) {
        return;
      }

      const memberUpdateRef = getMemberUpdateDocRef(spaceId, userId);

      await setDoc(
        memberUpdateRef,
        {
          ...nextSummary,
          userId,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    },
    [spaceId, userId],
  );

  const markMemberUpdatesAsSeen = useCallback(async () => {
    if (!spaceId || !userId) {
      return;
    }

    const zeroedSummary = createZeroMemberUpdateSummary(
      userId,
      Date.now(),
    );

    await persistMemberUpdate(zeroedSummary);
  }, [persistMemberUpdate, spaceId, userId]);

  useEffect(() => {
    if (!spaceId || !userId) {
      return;
    }

    let isActive = true;
    const ref = getMemberUpdateDocRef(spaceId, userId);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (!isActive) {
          return;
        }

        if (!snapshot.exists()) {
          const zeroedSummary = createZeroMemberUpdateSummary(
            userId,
            Date.now(),
          );

          void setDoc(ref, zeroedSummary, { merge: true }).catch(
            (writeError: Error) => {
              setError(writeError.message);
            },
          );

          setMemberUpdate(zeroedSummary);
          setLoading(false);
          return;
        }

        setMemberUpdate(
          normalizeMemberUpdateSummary(snapshot.data(), userId) ?? null,
        );
        setLoading(false);
      },
      (queryError) => {
        if (!isActive) {
          return;
        }

        setError(queryError.message);
        setLoading(false);
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [spaceId, userId]);

  const summary = useMemo(() => {
    if (!userId) {
      return null;
    }

    return calculateMemberUpdateSummary({
      boxes,
      items,
      memberId: userId,
      lastSurfacedAt: memberUpdate?.lastSurfacedAt ?? null,
    });
  }, [boxes, items, memberUpdate, userId]);

  useEffect(() => {
    if (!userId || !memberUpdate) {
      return;
    }

    const lastSurfacedAt = memberUpdate.lastSurfacedAt ?? Date.now();
    const autoDismissEligible = lastSurfacedAt + AUTO_DISMISS_MS <= Date.now();

    if (!hasMemberUpdateSummary(summary) && autoDismissEligible) {
      void markMemberUpdatesAsSeen();
    }
  }, [markMemberUpdatesAsSeen, memberUpdate, summary, userId]);

  const visibleSummary = spaceId && userId ? summary : null;
  const visibleLoading = Boolean(spaceId && userId) && loading;
  const visibleError = spaceId && userId ? error : null;

  return {
    summary: visibleSummary,
    loading: visibleLoading,
    error: visibleError,
    markMemberUpdatesAsSeen,
  };
}
