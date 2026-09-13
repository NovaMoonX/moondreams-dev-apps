import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { db } from '@lib/firebase/config';
import { getUniqueInviteCode } from '@lib/firebase/firestore';
import { createSpaceEncryptionKey, normalizeSpaceEncryption } from '../security';
import { SPACE_CODE_LENGTH } from '../utils/generateCode';

import type { ActiveAction, PendingMember, Space } from '../types';

const SPACE_COLLECTION = collection(db, 'apps', 'worth-the-wait', 'spaces');
const INVITE_CODE_COLLECTION = collection(
  db,
  'apps',
  'worth-the-wait',
  'inviteCodes',
);

function createInviteCodeRef(inviteCode: string) {
  const result = doc(INVITE_CODE_COLLECTION, inviteCode);
  return result;
}

const PENDING_REQUESTS_COLLECTION = collection(db, 'apps', 'worth-the-wait', 'pendingRequests');

function pendingRequestRef(uid: string) {
  return doc(PENDING_REQUESTS_COLLECTION, uid);
}

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
  const now = Date.now();

  return {
    id,
    createdBy: String(data.createdBy ?? ''),
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : now,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : now,
    members: Array.isArray(data.members) ? data.members.map(String) : [],
    inviteCode: typeof data.inviteCode === 'string' ? data.inviteCode : null,
    activeAction: normalizeActiveAction(data.activeAction),
    welcomeSeenBy: normalizeWelcomeSeenBy(data.welcomeSeenBy),
    encryption: normalizeSpaceEncryption(data.encryption ?? null),
  };
}

function normalizePendingMember(id: string, data: DocumentData): PendingMember {
  return {
    uid: typeof data.uid === 'string' ? data.uid : id,
    requestedAt: typeof data.requestedAt === 'number' ? data.requestedAt : Date.now(),
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
  const [spaceId_, setSpaceId_] = useState<string | null>(null);

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

    // Only query by `members` — the creator is always written into `members`
    // at creation, and a separate createdBy query isn't provably safe under
    // the member-only read rule (Firestore can deny it in isolation).
    const activeQuery = query(
      SPACE_COLLECTION,
      where('members', 'array-contains', userUid),
    );

    const activeUnsubscribe = onSnapshot(
      activeQuery,
      (snapshot) => {
        if (!isActive) {
          return;
        }

        const nextActiveSpace =
          snapshot.docs.length > 0
            ? normalizeSpace(snapshot.docs[0].id, snapshot.docs[0].data())
            : null;

        setSpace(nextActiveSpace);
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
      activeUnsubscribe();
    };
  }, [userUid]);

  // Pending join requests live in their own top-level collection (not a
  // field on the space doc itself) so a not-yet-approved requester never
  // needs read access to the space doc, which carries its encryption key.
  const spaceId = space?.id ?? null;

  if (spaceId !== spaceId_) {
    setSpaceId_(spaceId);
    setPendingMember(null);
  }

  useEffect(() => {
    if (!spaceId) {
      return;
    }

    let isActive = true;

    const spaceRequestsQuery = query(
      PENDING_REQUESTS_COLLECTION,
      where('spaceId', '==', spaceId),
    );

    const unsubscribe = onSnapshot(
      spaceRequestsQuery,
      (snapshot) => {
        if (!isActive) {
          return;
        }

        const firstRequest = snapshot.docs[0];
        setPendingMember(
          firstRequest ? normalizePendingMember(firstRequest.id, firstRequest.data()) : null,
        );
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
      unsubscribe();
    };
  }, [spaceId]);

  const createSpace = useCallback(
    async (inviteCode: string) => {
      setIsCreatingSpace(true);
      if (!userUid) {
        setIsCreatingSpace(false);
        throw new Error('A user is required to create a space.');
      }

      try {
        const spaceRef = doc(SPACE_COLLECTION);
        const uniqueInviteCode = await getUniqueInviteCode(INVITE_CODE_COLLECTION, {
          length: SPACE_CODE_LENGTH,
          preferredCode: inviteCode,
        });
        const inviteCodeRef = createInviteCodeRef(uniqueInviteCode);
        const now = Date.now();
        const encryption = createSpaceEncryptionKey();
        const payload = {
          id: spaceRef.id,
          createdBy: userUid,
          createdAt: now,
          members: [userUid],
          inviteCode: uniqueInviteCode,
          activeAction: null,
          welcomeSeenBy: {},
          encryption,
          updatedAt: now,
        };

        const batch = writeBatch(db);
        batch.set(spaceRef, payload);
        batch.set(inviteCodeRef, {
          spaceId: spaceRef.id,
        });
        await batch.commit();

        setSpace(normalizeSpace(spaceRef.id, payload));
        setPendingMember(null);
        setError(null);
        setIsCreatingSpace(false);
        return uniqueInviteCode;
      } catch (createError) {
        setIsCreatingSpace(false);
        throw createError;
      }

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

      const inviteCodeRef = createInviteCodeRef(trimmedCode);
      let inviteCodeSnapshot;
      try {
        inviteCodeSnapshot = await getDoc(inviteCodeRef);
      } catch (lookupError) {
        handleThrowError(
          'Failed to look up the space by invite code.',
          lookupError,
        );
      }

      if (!inviteCodeSnapshot!.exists()) {
        handleThrowError('That invite code does not match an available space.');
      }

      const inviteCodeLookup = inviteCodeSnapshot!.data();
      const spaceId =
        typeof inviteCodeLookup?.spaceId === 'string'
          ? inviteCodeLookup.spaceId
          : '';

      if (!spaceId) {
        handleThrowError('No space found for that invite code.');
      }

      try {
        const requestRef = pendingRequestRef(userUid);
        const existingRequestSnapshot = await getDoc(requestRef);

        if (existingRequestSnapshot.exists()) {
          handleThrowError('You already have a pending request to join this space.');
        }

        const requestedAt = Date.now();

        await setDoc(requestRef, {
          uid: userUid,
          spaceId,
          inviteCode: trimmedCode,
          requestedAt,
        });

        setError(null);
        setIsJoiningSpace(false);
        setJoinRequestSent(true);
      } catch (writeError) {
        handleThrowError(
          'Unable to request access to this space. It may already be full or unavailable.',
          writeError,
        );
      }

      return spaceId;
    },
    [userUid],
  );

  const approvePendingMember = useCallback(async () => {
    if (!space || !pendingMember) {
      throw new Error('There is no pending member to approve.');
    }

    const nextMembers = Array.from(new Set([...space.members, pendingMember.uid]));
    const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', space.id);

    // The rules require the approved uid's own request to be deleted in the
    // same commit as the members update, so this batch is scoped to exactly
    // that — not every stray request, which could exceed the 500-write
    // batch limit and isn't something the rules need to verify atomically.
    const batch = writeBatch(db);
    batch.update(spaceRef, {
      members: nextMembers,
      inviteCode: null,
      activeAction: null,
      welcomeSeenBy: {
        ...(space.welcomeSeenBy ?? {}),
      },
      updatedAt: Date.now(),
    });
    if (space.inviteCode) {
      batch.delete(createInviteCodeRef(space.inviteCode));
    }
    batch.delete(pendingRequestRef(pendingMember.uid));
    await batch.commit();

    setSpace({
      ...space,
      members: nextMembers,
      inviteCode: null,
      activeAction: null,
    });
    setPendingMember(null);
    setError(null);

    // Best-effort cleanup of any other stray requests (a second person may
    // have requested in the meantime, before the space filled) — not part
    // of the approval's atomicity guarantee, so failures here don't matter.
    getDocs(query(PENDING_REQUESTS_COLLECTION, where('spaceId', '==', space.id)))
      .then((strayRequests) => {
        const strays = strayRequests.docs.filter((requestDoc) => requestDoc.id !== pendingMember.uid);

        if (strays.length === 0) {
          return;
        }

        const cleanupBatch = writeBatch(db);
        strays.forEach((requestDoc) => cleanupBatch.delete(requestDoc.ref));
        return cleanupBatch.commit();
      })
      .catch((cleanupError) => console.error('Failed to clean up stray pending requests:', cleanupError));

    return nextMembers;
  }, [space, pendingMember]);

  const declinePendingMember = useCallback(async () => {
    if (!space || !pendingMember) {
      return;
    }

    await deleteDoc(pendingRequestRef(pendingMember.uid));

    setPendingMember(null);
    setError(null);
  }, [space, pendingMember]);

  const cancelJoinRequest = useCallback(async () => {
    if (!userUid) {
      return;
    }

    await deleteDoc(pendingRequestRef(userUid));
    setJoinRequestSent(false);
  }, [userUid]);

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
      cancelJoinRequest,
    }),
    [
      approvePendingMember,
      cancelJoinRequest,
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
