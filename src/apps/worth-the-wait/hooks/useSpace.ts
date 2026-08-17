import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
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

  const now = Date.now();

  return {
    id,
    createdBy: String(data.createdBy ?? ''),
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : now,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : now,
    members: Array.isArray(data.members) ? data.members.map(String) : [],
    inviteCode: typeof data.inviteCode === 'string' ? data.inviteCode : null,
    pendingMember:
      pendingMemberValue && typeof pendingMemberValue.uid === 'string'
        ? {
            uid: pendingMemberValue.uid,
            requestedAt:
              typeof pendingMemberValue.requestedAt === 'number'
                ? pendingMemberValue.requestedAt
                : Date.now(),
          }
        : null,
    activeAction:
      data.activeAction && typeof data.activeAction === 'object'
        ? (data.activeAction as Record<string, unknown>)
        : null,
  };
}

export function useSpace(userUid: string) {
  const hasUser = Boolean(userUid);
  const [space, setSpace] = useState<Space | null>(null);
  const [pendingMember, setPendingMember] = useState<PendingMember | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(userUid));
  const [error, setError] = useState<string | null>(null);

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
      const now = Date.now();
      const payload = {
        id: spaceRef.id,
        createdBy: userUid,
        createdAt: now,
        members: [userUid],
        inviteCode,
        pendingMember: null,
        activeAction: null,
        updatedAt: now,
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

      const requestedAt = Date.now();
      await updateDoc(match.ref, {
        pendingMember: {
          uid: userUid,
          requestedAt,
        },
      });

      setPendingMember({ uid: userUid, requestedAt });
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
      updatedAt: Date.now(),
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
      updatedAt: Date.now(),
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
      space: hasUser ? space : null,
      pendingMember: hasUser ? pendingMember : null,
      loading: hasUser ? loading : false,
      error: hasUser ? error : null,
      isLocked: hasUser ? Boolean(space && space.members.length >= 2) : false,
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
      hasUser,
      joinSpace,
      loading,
      pendingMember,
      space,
    ],
  );

  return value;
}

export default useSpace;
