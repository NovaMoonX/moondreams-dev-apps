import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { db } from '@lib/firebase/config';
import type { UserProfile } from '@lib/types/appCatalog';

export type UserInfo = {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  isAdmin?: boolean;
} & Partial<UserProfile>;

export type UserInfoMapResult = {
  map: Record<string, UserInfo>;
  users: UserInfo[];
};

function normalizeUserInfo(uid: string, value: unknown): UserInfo {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;

  return {
    uid,
    email: typeof data?.email === 'string' ? data.email : undefined,
    displayName:
      typeof data?.displayName === 'string' ? data.displayName : undefined,
    photoURL: typeof data?.photoURL === 'string' ? data.photoURL : undefined,
    isAdmin: data?.isAdmin === true,
  };
}

export function useUserInfo(userId?: string | null): UserInfo | null;

export function useUserInfo(userIds?: string[] | null): UserInfoMapResult | null;

export function useUserInfo(
  userIds?: string | string[] | null,
): UserInfo | UserInfoMapResult | null {
  const ids = useMemo(() => {
    if (!userIds) {
      return [];
    }

    const nextIds = Array.isArray(userIds) ? userIds : [userIds];
    const filteredIds: string[] = [];

    for (const uid of nextIds) {
      if (!uid || filteredIds.includes(uid)) {
        continue;
      }

      filteredIds.push(uid);
    }

    return filteredIds;
  }, [userIds]);

  const [users, setUsers] = useState<UserInfo[]>([]);

  useEffect(() => {
    if (ids.length === 0) {
      return;
    }

    const listeners = ids.map((uid) => {
      const userDocRef = doc(db, 'users', uid);

      return onSnapshot(userDocRef, (docSnapshot) => {
        const nextUser = normalizeUserInfo(uid, docSnapshot.data());

        setUsers((current) => {
          const filtered = current.filter((user) => user.uid !== uid);
          return [...filtered, nextUser];
        });
      });
    });

    return () => {
      listeners.forEach((unsubscribe) => unsubscribe());
    };
  }, [ids]);

  const usersMap = useMemo(
    () =>
      users.reduce<Record<string, UserInfo>>((acc, user) => {
        acc[user.uid] = user;
        return acc;
      }, {}),
    [users],
  );

  const result = useMemo(() => {
    if (ids.length === 0) {
      return null;
    }

    if (Array.isArray(userIds)) {
      const orderedUsers = ids.map(
        (uid) => usersMap[uid] ?? normalizeUserInfo(uid, null),
      );

      const result: UserInfoMapResult = {
        map: orderedUsers.reduce<Record<string, UserInfo>>((acc, user) => {
          acc[user.uid] = user;
          return acc;
        }, {}),
        users: orderedUsers,
      };

      return result;
    }

    const singleUser =
      usersMap[ids[0]] ?? normalizeUserInfo(ids[0], null);
    return singleUser;
  }, [ids, userIds, usersMap]);

  return result;
}
