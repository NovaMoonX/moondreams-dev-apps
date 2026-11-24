import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { useCallback, useSyncExternalStore } from 'react';

import { db } from '@lib/firebase/config';
import type { WhatsNewScope } from '@lib/whatsNew/whatsNewTypes';

/** What a person has seen of the "What's new" notes, on their account: `whatsNewSeen/{uid}`. */
export interface WhatsNewSeenDoc {
  uid: string;
  seen: Record<string, string>;
  /** Null is the default: fix-only updates still pop up for a debug viewer. */
  showFixOnly: boolean | null;
  updatedAt: number;
}

export interface WhatsNewSeenState {
  /** False until a server answer has arrived, so nothing is written over what the server holds. */
  isLoaded: boolean;
  seen: Record<string, string>;
  showFixOnly: boolean | null;
}

const NOT_LOADED: WhatsNewSeenState = {
  isLoaded: false,
  seen: {},
  showFixOnly: null,
};

interface SeenEntry {
  state: WhatsNewSeenState;
  watchers: Set<() => void>;
  stop: () => void;
}

// One listener per account, shared by the host and the account page.
const entries = new Map<string, SeenEntry>();

const startEntry = (uid: string): SeenEntry => {
  const entry: SeenEntry = {
    state: NOT_LOADED,
    watchers: new Set(),
    stop: () => undefined,
  };
  entry.stop = onSnapshot(
    doc(db, 'whatsNewSeen', uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      // An empty cache answer while offline says nothing about the account's own copy.
      if (!snapshot.exists() && snapshot.metadata.fromCache) return;
      const data = snapshot.data() as Partial<WhatsNewSeenDoc> | undefined;
      entry.state = {
        isLoaded: true,
        seen: data?.seen && typeof data.seen === 'object' ? data.seen : {},
        showFixOnly:
          typeof data?.showFixOnly === 'boolean' ? data.showFixOnly : null,
      };
      entry.watchers.forEach((watcher) => watcher());
    },
    (error) => console.error("Failed to load what's new marks:", error),
  );
  return entry;
};

const watchSeen = (uid: string, onChange: () => void) => {
  const entry = entries.get(uid) ?? startEntry(uid);
  entries.set(uid, entry);
  entry.watchers.add(onChange);
  return () => {
    entry.watchers.delete(onChange);
    if (entry.watchers.size > 0) return;
    entry.stop();
    entries.delete(uid);
  };
};

export function useWhatsNewSeen(uid: string | null): WhatsNewSeenState {
  const subscribe = useCallback(
    (onChange: () => void) =>
      uid === null ? () => undefined : watchSeen(uid, onChange),
    [uid],
  );
  const getSnapshot = useCallback(
    () => (uid === null ? NOT_LOADED : (entries.get(uid)?.state ?? NOT_LOADED)),
    [uid],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Changes one field of the account's marks, or creates the whole document when it isn't there yet; never resets another field. */
const writeField = (
  uid: string,
  updates: Record<string, unknown>,
  created: Partial<WhatsNewSeenDoc>,
) => {
  const ref = doc(db, 'whatsNewSeen', uid);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const updatedAt = Date.now();
    if (snapshot.exists()) {
      transaction.update(ref, { ...updates, updatedAt });
      return;
    }
    transaction.set(ref, {
      uid,
      seen: {},
      showFixOnly: null,
      ...created,
      updatedAt,
    });
  });
};

/** Remembers that the person has seen a scope's notes up to a version. */
export const writeWhatsNewSeen = (
  uid: string,
  scope: WhatsNewScope,
  version: string,
) =>
  writeField(
    uid,
    { [`seen.${scope}`]: version },
    { seen: { [scope]: version } },
  );

export const writeShowFixOnly = (uid: string, showFixOnly: boolean) =>
  writeField(uid, { showFixOnly }, { showFixOnly });
