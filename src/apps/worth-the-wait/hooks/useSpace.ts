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
import { createSpaceEncryptionKey, normalizeSpaceEncryption } from '../security';

import type { ActiveAction, PendingMember, Space } from '../types';

const SPACE_COLLECTION = collection(db, 'apps', 'worth-the-wait', 'spaces');

function normalizeActiveAction(value: unknown): ActiveAction | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const action = value as Record<string, unknown>;
  const method =
    action.method === 'full_reveal' || action.method === 'raffle'
      ? action.method
      : null;

  if (!method) {
    return null;
  }

  const status =
    action.status === 'initiating' ||
    action.status === 'executing' ||
    action.status === 'completed'
      ? action.status
      : 'completed';

  const startedAtValue = action.startedAt;
  const startedAt =
    typeof startedAtValue === 'number'
      ? startedAtValue
      : typeof startedAtValue === 'object' &&
          startedAtValue &&
          'seconds' in startedAtValue
        ? Number((startedAtValue as { seconds: number }).seconds) * 1000
        : Date.now();

  const completedAtValue = action.completedAt;
  const completedAt =
    typeof completedAtValue === 'number'
      ? completedAtValue
      : typeof completedAtValue === 'object' &&
          completedAtValue &&
          'seconds' in completedAtValue
        ? Number((completedAtValue as { seconds: number }).seconds) * 1000
        : null;

  return {
    actionId: typeof action.actionId === 'string' ? action.actionId : '',
    boxId: typeof action.boxId === 'string' ? action.boxId : '',
    method,
    status,
    selectedItemIds: Array.isArray(action.selectedItemIds)
      ? action.selectedItemIds.map(String)
      : [],
    initiatedBy:
      typeof action.initiatedBy === 'string' ? action.initiatedBy : '',
    startedAt,
    completedAt,
  };
}

function normalizeWelcomeSeenBy(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>);

  return entries.reduce<Record<string, number>>(
    (result, [userId, timestamp]) => {
      if (!userId) {
        return result;
      }

      const seenAt =
        typeof timestamp === 'number'
          ? timestamp
          : typeof timestamp === 'object' && timestamp && 'seconds' in timestamp
            ? Number((timestamp as { seconds: number }).seconds) * 1000
            : null;

      if (typeof seenAt === 'number' && Number.isFinite(seenAt)) {
        result[userId] = seenAt;
      }

      return result;
    },
    {},
  );
}

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
    activeAction: normalizeActiveAction(data.activeAction),
    welcomeSeenBy: normalizeWelcomeSeenBy(data.welcomeSeenBy),
    encryption: normalizeSpaceEncryption(data.encryption ?? null),
  };
}

export function useSpace(userUid: string) {
  const hasUser = Boolean(userUid);
  const [userUid_, setUserUid_] = useState(userUid);
  const [space, setSpace] = useState<Space | null>(null);
  const [pendingMember, setPendingMember] = useState<PendingMember | null>(
    null,
  );
  const [isJoiningSpace, setIsJoiningSpace] = useState(false);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [joinRequestSent, setJoinRequestSent] = useState(false);
  const [loading, setLoading] = useState(Boolean(userUid));
  const [error, setError] = useState<string | null>(null);

  if (userUid !== userUid_) {
    setUserUid_(userUid);
    setSpace(null);
    setPendingMember(null);
    setIsJoiningSpace(false);
    setIsCreatingSpace(false);
    setJoinRequestSent(false);
    setLoading(Boolean(userUid));
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
      setIsCreatingSpace(true);
      if (!userUid) {
        setIsCreatingSpace(false);
        throw new Error('A user is required to create a space.');
      }

      const spaceRef = doc(SPACE_COLLECTION);
      const now = Date.now();
      const encryption = createSpaceEncryptionKey();
      const payload = {
        id: spaceRef.id,
        createdBy: userUid,
        createdAt: now,
        members: [userUid],
        inviteCode,
        pendingMember: null,
        activeAction: null,
        welcomeSeenBy: {},
        encryption,
        updatedAt: now,
      };

      await setDoc(spaceRef, payload);
      setSpace(normalizeSpace(spaceRef.id, payload));
      setPendingMember(null);
      setError(null);
      setIsCreatingSpace(false);

      return inviteCode;
    },
    [userUid],
  );

  const joinSpace = useCallback(
    async (inviteCode: string) => {
      setIsJoiningSpace(true);
      const trimmedCode = inviteCode.trim().toUpperCase();

      const handleThrowError = (message: string, cause?: unknown) => {
        setIsJoiningSpace(false);
        throw new Error(message, cause ? { cause } : undefined);
      };

      if (!trimmedCode) {
        handleThrowError('Enter a valid invite code.');
      }

      if (!userUid) {
        handleThrowError('A user is required to join a space.');
      }

      let snapshot;
      try {
        const lookupQuery = query(
          SPACE_COLLECTION,
          where('inviteCode', '==', trimmedCode),
        );
        snapshot = await getDocs(lookupQuery);
      } catch (lookupError) {
        handleThrowError(
          'Failed to look up the space by invite code.',
          lookupError,
        );
      }

      if (snapshot!.empty) {
        handleThrowError('That invite code does not match an active space.');
      }

      const match = snapshot!.docs[0];
      const existingSpace = normalizeSpace(match.id, match.data());

      if (existingSpace.members.includes(userUid)) {
        handleThrowError('You are already part of this space.');
      }

      if (existingSpace.members.length >= 2) {
        handleThrowError('This space is already full.');
      }

      if (
        existingSpace.pendingMember &&
        existingSpace.pendingMember.uid !== userUid
      ) {
        handleThrowError('This space already has a pending join request.');
      }

      try {
        const requestedAt = Date.now();
        await updateDoc(match.ref, {
          pendingMember: {
            uid: userUid,
            requestedAt,
          },
        });

        setPendingMember({ uid: userUid, requestedAt });
        setError(null);
        setIsJoiningSpace(false);
        setJoinRequestSent(true);
      } catch (updateError) {
        handleThrowError(
          'Failed to submit the join request for this space.',
          updateError,
        );
      }

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
      welcomeSeenBy: {
        ...(space.welcomeSeenBy ?? {}),
      },
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
      isJoiningSpace: hasUser ? isJoiningSpace : false,
      isCreatingSpace: hasUser ? isCreatingSpace : false,
      joinRequestSent: hasUser ? joinRequestSent : false,
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
      isJoiningSpace,
      isCreatingSpace,
      joinRequestSent,
      loading,
      pendingMember,
      space,
    ],
  );

  return value;
}

export default useSpace;
