import { db } from '@lib/firebase/config';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';

import { normalizeSpaceEncryption, type SpaceEncryption } from '../security';
import type { Box, Item, MemberUpdateSummary } from '../types';
import { normalizeBox } from '../utils/boxHelpers';
import { normalizeItem } from '../utils/itemHelpers';
import {
  calculateMemberUpdateSummary,
  hasMemberUpdateSummary,
  normalizeMemberUpdateSummary,
} from '../utils/memberUpdates';

async function getSpaceEncryption(
  spaceId: string,
): Promise<SpaceEncryption | null> {
  const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId);
  const snapshot = await getDoc(spaceRef);

  return normalizeSpaceEncryption(snapshot.data()?.encryption ?? null);
}

export function useMemberUpdates(spaceId: string, userId: string) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [memberUpdate, setMemberUpdate] = useState<MemberUpdateSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(spaceId && userId));
  const [error, setError] = useState<string | null>(null);
  const pendingWriteRef = useRef(false);

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
    const memberUpdateRef = doc(
      db,
      'apps',
      'worth-the-wait',
      'spaces',
      spaceId,
      'memberUpdates',
      userId,
    );

    const unsubscribe = onSnapshot(
      memberUpdateRef,
      (snapshot) => {
        if (!isActive) {
          return;
        }

        setMemberUpdate(
          snapshot.exists()
            ? (normalizeMemberUpdateSummary(snapshot.data(), userId) ?? null)
            : null,
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

    const lastSurfacedAt = memberUpdate?.lastSurfacedAt ?? null;

    return calculateMemberUpdateSummary({
      boxes,
      items,
      memberId: userId,
      lastSurfacedAt,
    });
  }, [boxes, items, memberUpdate, userId]);

  useEffect(() => {
    if (!spaceId || !userId || pendingWriteRef.current) {
      return;
    }

    const memberUpdateRef = doc(
      db,
      'apps',
      'worth-the-wait',
      'spaces',
      spaceId,
      'memberUpdates',
      userId,
    );

    if (memberUpdate === null) {
      pendingWriteRef.current = true;
      const timestamp = Date.now();

      void setDoc(
        memberUpdateRef,
        {
          userId,
          createdBoxes: 0,
          updatedBoxes: 0,
          newItems: 0,
          newReveals: 0,
          lastSurfacedAt: timestamp,
          updatedAt: timestamp,
        },
        { merge: true },
      )
        .catch((writeError: Error) => {
          setError(writeError.message);
        })
        .finally(() => {
          pendingWriteRef.current = false;
        });

      return;
    }

    if (!hasMemberUpdateSummary(summary)) {
      return;
    }

    pendingWriteRef.current = true;
    const timestamp = Date.now();

    void setDoc(
      memberUpdateRef,
      {
        ...summary,
        userId,
        lastSurfacedAt: timestamp,
        updatedAt: timestamp,
      },
      { merge: true },
    )
      .catch((writeError: Error) => {
        setError(writeError.message);
      })
      .finally(() => {
        pendingWriteRef.current = false;
      });
  }, [memberUpdate, spaceId, summary, userId]);

  return { summary, loading, error };
}
