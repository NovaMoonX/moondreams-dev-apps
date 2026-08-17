import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { db } from '@lib/firebase/config';

import type { PendingMember, Space } from '../types';

const SPACE_COLLECTION = collection(db, 'apps', 'worth-the-wait', 'spaces');

function normalizeSpace(id: string, data: DocumentData): Space {
  const pendingMemberValue = data.pendingMember as
    Record<string, unknown> | null | undefined;

  return {
    id,
    createdBy: String(data.createdBy ?? ''),
    createdAt: (data.createdAt as Space['createdAt']) ?? null,
    members: Array.isArray(data.members) ? data.members.map(String) : [],
    inviteCode: typeof data.inviteCode === 'string' ? data.inviteCode : null,
    pendingMember:
      pendingMemberValue && typeof pendingMemberValue.uid === 'string'
        ? {
            uid: pendingMemberValue.uid,
            requestedAt: Number(pendingMemberValue.requestedA),
          }
        : null,
    activeAction:
      data.activeAction && typeof data.activeAction === 'object'
        ? (data.activeAction as Record<string, unknown>)
        : null,
  };
}

export function useSpace(userUid: string) {
  const [space, setSpace] = useState<Space | null>(null);
  const [pendingMember, setPendingMember] = useState<PendingMember | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(userUid));
  const [error, setError] = useState<string | null>(null);

  if (!userUid) {
    setSpace(null);
    setPendingMember(null);
    setLoading(false);
    setError(null);
  }

  useEffect(() => {
    if (!userUid) {
      return;
    }

    let isActive = true;
    let nextActiveSpace: Space | null = null;
    let nextPendingMember: PendingMember | null = null;

    const activeQuery = query(
      SPACE_COLLECTION,
      where('members', 'array-contains', userUid),
    );
    const creatorQuery = query(
      SPACE_COLLECTION,
      where('createdBy', '==', userUid),
    );

    const activeUnsubscribe = onSnapshot(
      activeQuery,
      (snapshot) => {
        if (!isActive) {
          return;
        }

        nextActiveSpace =
          snapshot.docs.length > 0
            ? normalizeSpace(snapshot.docs[0].id, snapshot.docs[0].data())
            : null;

        setSpace(nextActiveSpace ?? null);
        setPendingMember(nextPendingMember);
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

    const creatorUnsubscribe = onSnapshot(
      creatorQuery,
      (snapshot) => {
        if (!isActive) {
          return;
        }

        const creatorSpaces = snapshot.docs.map((documentSnapshot) =>
          normalizeSpace(documentSnapshot.id, documentSnapshot.data()),
        );

        const creatorSpace = creatorSpaces[0] ?? null;
        const nextPending = creatorSpace?.pendingMember ?? null;

        nextPendingMember = nextPending;
        setPendingMember(nextPending);
        setSpace(nextActiveSpace ?? creatorSpace ?? null);
      },
      (queryError) => {
        if (!isActive) {
          return;
        }

        setError(queryError.message);
      },
    );

    return () => {
      isActive = false;
      activeUnsubscribe();
      creatorUnsubscribe();
    };
  }, [userUid]);

  const createSpace = useCallback(
    async (inviteCode: string) => {
      if (!userUid) {
        throw new Error('A user is required to create a space.');
      }

      const spaceRef = doc(SPACE_COLLECTION);
      const payload = {
        id: spaceRef.id,
        createdBy: userUid,
        createdAt: serverTimestamp(),
        members: [userUid],
        inviteCode,
        pendingMember: null,
        activeAction: null,
        updatedAt: serverTimestamp(),
      };

      await setDoc(spaceRef, payload);
      setSpace(normalizeSpace(spaceRef.id, payload));
      setPendingMember(null);
      setError(null);

      return inviteCode;
    },
    [userUid],
  );

  const joinSpace = useCallback(
    async (inviteCode: string) => {
      const trimmedCode = inviteCode.trim().toUpperCase();

      if (!trimmedCode) {
        throw new Error('Enter a valid invite code.');
      }

      if (!userUid) {
        throw new Error('A user is required to join a space.');
      }

      const lookupQuery = query(
        SPACE_COLLECTION,
        where('inviteCode', '==', trimmedCode),
      );
      const snapshot = await getDocs(lookupQuery);

      if (snapshot.empty) {
        throw new Error('That invite code does not match an active space.');
      }

      const match = snapshot.docs[0];
      const existingSpace = normalizeSpace(match.id, match.data());

      if (existingSpace.members.includes(userUid)) {
        throw new Error('You are already part of this space.');
      }

      if (existingSpace.members.length >= 2) {
        throw new Error('This space is already full.');
      }

      if (
        existingSpace.pendingMember &&
        existingSpace.pendingMember.uid !== userUid
      ) {
        throw new Error('This space already has a pending join request.');
      }

      await updateDoc(match.ref, {
        pendingMember: {
          uid: userUid,
          requestedAt: serverTimestamp(),
        },
      });

      setPendingMember({ uid: userUid, requestedAt: Date.now() });
      setError(null);
      return match.id;
    },
    [userUid],
  );

  const approvePendingMember = useCallback(async () => {
    if (!space || !space.pendingMember) {
      throw new Error('There is no pending member to approve.');
    }

    const nextMembers = Array.from(
      new Set([...space.members, space.pendingMember.uid]),
    );
    const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', space.id);

    await updateDoc(spaceRef, {
      members: nextMembers,
      pendingMember: null,
      inviteCode: null,
      activeAction: null,
      updatedAt: serverTimestamp(),
    });

    setSpace({
      ...space,
      members: nextMembers,
      pendingMember: null,
      inviteCode: null,
      activeAction: null,
    });
    setPendingMember(null);
    setError(null);

    return nextMembers;
  }, [space]);

  const declinePendingMember = useCallback(async () => {
    if (!space || !space.pendingMember) {
      return;
    }

    const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', space.id);

    await updateDoc(spaceRef, {
      pendingMember: null,
      updatedAt: serverTimestamp(),
    });

    setPendingMember(null);
    setSpace({
      ...space,
      pendingMember: null,
    });
    setError(null);
  }, [space]);

  const value = useMemo(
    () => ({
      space,
      pendingMember,
      loading,
      error,
      isLocked: Boolean(space && space.members.length >= 2),
      createSpace,
      joinSpace,
      approvePendingMember,
      declinePendingMember,
    }),
    [
      approvePendingMember,
      createSpace,
      declinePendingMember,
      error,
      joinSpace,
      loading,
      pendingMember,
      space,
    ],
  );

  return value;
}

export default useSpace;
