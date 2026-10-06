import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

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

function getStringField(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

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
    photoURL:
      getStringField(data?.customPhotoURL) ?? getStringField(data?.photoURL),
    isAdmin: data?.isAdmin === true,
  };
}

// One Firestore listener per user, shared by every component that shows them and kept only while
// someone is watching: a long timeline asks for the same people on every card.
interface UserEntry {
  info: UserInfo;
  rev: number;
  watchers: Set<() => void>;
  stop: (() => void) | null;
}

const entries = new Map<string, UserEntry>();
const pendingWatchers = new Set<() => void>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// A long timeline loads many profiles in a burst; one render per burst, not one per profile
// (each of those is a synchronous store update and, past 50 in a row, React aborts).
const notifyWatchers = (watchers: Set<() => void>) => {
  watchers.forEach((watcher) => pendingWatchers.add(watcher));
  flushTimer ??= setTimeout(() => {
    flushTimer = null;
    const batch = [...pendingWatchers];
    pendingWatchers.clear();
    batch.forEach((watcher) => watcher());
  }, 50);
};

/** Forgets every cached profile, so the next person to sign in never sees the last one's. */
export function clearUserInfoStore() {
  entries.forEach((entry) => {
    entry.info = normalizeUserInfo(entry.info.uid, null);
    entry.rev += 1;
    notifyWatchers(entry.watchers);
  });
}

const getEntry = (uid: string) => {
  const existing = entries.get(uid);
  if (existing) {
    return existing;
  }
  const entry: UserEntry = { info: normalizeUserInfo(uid, null), rev: 0, watchers: new Set(), stop: null };
  entries.set(uid, entry);
  return entry;
};

function watchUser(uid: string, onChange: () => void) {
  const entry = getEntry(uid);
  entry.watchers.add(onChange);
  if (!entry.stop) {
    entry.stop = onSnapshot(
      doc(db, 'users', uid),
      (docSnapshot) => {
        entry.info = normalizeUserInfo(uid, docSnapshot.data());
        entry.rev += 1;
        notifyWatchers(entry.watchers);
      },
      () => {},
    );
  }

  return () => {
    entry.watchers.delete(onChange);
    pendingWatchers.delete(onChange);
    if (entry.watchers.size === 0 && entry.stop) {
      entry.stop();
      entry.stop = null;
    }
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

    return Array.from(new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean)));
  }, [userIds]);

  // Callers often pass a freshly-built array each render, so the subscription is keyed on the ids'
  // content (`ids` itself is used, not a join/split round trip that would corrupt an id with a comma).
  const idsKey = ids.join(',');
  const subscribe = useCallback(
    (onChange: () => void) => {
      const stops = ids.map((uid) => watchUser(uid, onChange));
      return () => stops.forEach((stop) => stop());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey is ids' content signal
    [idsKey],
  );
  // A profile change re-renders only the components showing that person.
  const getRevisions = useCallback(
    () => ids.map((uid) => getEntry(uid).rev).join(','),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey is ids' content signal
    [idsKey],
  );
  const revisions = useSyncExternalStore(subscribe, getRevisions);

  const result = useMemo(() => {
    if (ids.length === 0) {
      return null;
    }

    if (Array.isArray(userIds)) {
      const orderedUsers = ids.map((uid) => getEntry(uid).info);
      const mapResult: UserInfoMapResult = {
        map: Object.fromEntries(orderedUsers.map((user) => [user.uid, user])),
        users: orderedUsers,
      };
      return mapResult;
    }

    return getEntry(ids[0]).info;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revisions signals a changed profile
  }, [ids, userIds, revisions]);

  return result;
}
