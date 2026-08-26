import { db } from '@lib/firebase/config';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { normalizeSpaceEncryption, type SpaceEncryption } from '../security';
import type { Box, Item, MemberUpdateSummary } from '../types';
import { normalizeBox } from '../utils/boxHelpers';
import { normalizeItem } from '../utils/itemHelpers';
import {
  calculateMemberUpdateSummary,
  hasMemberUpdateSummary,
  normalizeMemberUpdateSummary,
} from '../utils/memberUpdates';

const AUTO_DISMISS_MS = 24 * 60 * 60 * 1000;

async function getSpaceEncryption(
  spaceId: string,
): Promise<SpaceEncryption | null> {
  const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId);
  const snapshot = await getDoc(spaceRef);

  return normalizeSpaceEncryption(snapshot.data()?.encryption ?? null);
}

function createZeroMemberUpdateSummary(
  userId: string,
  lastSurfacedAt = Date.now(),
): MemberUpdateSummary {
  const timestamp = Date.now();

  return {
    userId,
    createdBoxes: 0,
    updatedBoxes: 0,
    newItems: 0,
    lastSurfacedAt,
    updatedAt: timestamp,
  };
}

export function useMemberUpdates(spaceId: string, userId: string) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [memberUpdate, setMemberUpdate] = useState<MemberUpdateSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(spaceId && userId));
  const [error, setError] = useState<string | null>(null);

  const memberUpdateRef = useMemo(
    () =>
      spaceId && userId
        ? doc(
            db,
            'apps',
            'worth-the-wait',
            'spaces',
            spaceId,
            'memberUpdates',
            userId,
          )
        : null,
    [spaceId, userId],
  );

  const persistMemberUpdate = useCallback(
    async (nextSummary: MemberUpdateSummary) => {
      if (!memberUpdateRef) {
        return;
      }

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
    [memberUpdateRef, userId],
  );

  const markMemberUpdatesAsSeen = useCallback(async () => {
    if (!spaceId || !userId) {
      return;
    }

    const timestamp = Date.now();
    const zeroedSummary = createZeroMemberUpdateSummary(userId, timestamp);
    await persistMemberUpdate(zeroedSummary);
  }, [persistMemberUpdate, spaceId, userId]);

  useEffect(() => {
    if (!spaceId) {
      return;
    }

    let isActive = true;
    const boxCollection = collection(
      db,
      'apps',
      'worth-the-wait',
      'spaces',
      spaceId,
      'boxes',
    );

    const unsubscribe = onSnapshot(
      boxCollection,
      async (snapshot) => {
        if (!isActive) {
          return;
        }

        const spaceEncryption = await getSpaceEncryption(spaceId);
        const nextBoxes = (
          await Promise.all(
            snapshot.docs.map(async (documentSnapshot) =>
              normalizeBox(
                documentSnapshot.id,
                documentSnapshot.data(),
                spaceEncryption,
              ),
            ),
          )
        ).sort((left, right) => {
          if (left.createdAt === right.createdAt) {
            return left.name.localeCompare(right.name);
          }

          return left.createdAt - right.createdAt;
        });

        setBoxes(nextBoxes);
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
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId || boxes.length === 0) {
      return;
    }

    let isActive = true;

    const loadItems = async () => {
      const spaceEncryption = await getSpaceEncryption(spaceId);
      const nextItems = (
        await Promise.all(
          boxes.map(async (box) => {
            const boxItemsCollection = collection(
              db,
              'apps',
              'worth-the-wait',
              'spaces',
              spaceId,
              'boxes',
              box.id,
              'items',
            );
            const itemSnapshots = await getDocs(boxItemsCollection);

            return Promise.all(
              itemSnapshots.docs.map(async (documentSnapshot) =>
                normalizeItem(
                  documentSnapshot.id,
                  documentSnapshot.data(),
                  spaceEncryption,
                ),
              ),
            );
          }),
        )
      ).flat();

      if (isActive) {
        setItems(nextItems);
      }
    };

    void loadItems().catch((queryError: Error) => {
      if (!isActive) {
        return;
      }

      setError(queryError.message);
    });

    return () => {
      isActive = false;
    };
  }, [boxes, spaceId]);

  useEffect(() => {
    if (!spaceId || !userId) {
      return;
    }

    let isActive = true;
    const ref = doc(
      db,
      'apps',
      'worth-the-wait',
      'spaces',
      spaceId,
      'memberUpdates',
      userId,
    );

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (!isActive) {
          return;
        }

        if (!snapshot.exists()) {
          const zeroedSummary = createZeroMemberUpdateSummary(userId, Date.now());

          void setDoc(ref, zeroedSummary, { merge: true }).catch((writeError: Error) => {
            setError(writeError.message);
          });

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
    if (!userId || !memberUpdate || !hasMemberUpdateSummary(summary)) {
      if (!userId || !memberUpdate) {
        return;
      }

      const lastSurfacedAt = memberUpdate.lastSurfacedAt ?? Date.now();
      const autoDismissEligible =
        lastSurfacedAt + AUTO_DISMISS_MS <= Date.now();

      if (autoDismissEligible) {
        void markMemberUpdatesAsSeen();
      }

      return;
    }
  }, [markMemberUpdatesAsSeen, memberUpdate, summary, userId]);

  return {
    summary,
    loading,
    error,
    markMemberUpdatesAsSeen,
  };
}
