import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';

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
  /** False until the account's own copy has been read, so nothing is written over what the server holds. */
  isLoaded: boolean;
  doesExist: boolean;
  seen: Record<string, string>;
  showFixOnly: boolean | null;
}

const NOT_LOADED: WhatsNewSeenState = {
  isLoaded: false,
  doesExist: false,
  seen: {},
  showFixOnly: null,
};

export function useWhatsNewSeen(uid: string | null): WhatsNewSeenState {
  const [loaded, setLoaded] = useState<{
    uid: string;
    state: WhatsNewSeenState;
  } | null>(null);

  useEffect(() => {
    if (uid === null) return;
    return onSnapshot(
      doc(db, 'whatsNewSeen', uid),
      { includeMetadataChanges: true },
      (snapshot) => {
        // An empty cache answer while offline says nothing about the account's own copy.
        if (!snapshot.exists() && snapshot.metadata.fromCache) return;
        const data = snapshot.data() as Partial<WhatsNewSeenDoc> | undefined;
        setLoaded({
          uid,
          state: {
            isLoaded: true,
            doesExist: snapshot.exists(),
            seen: data?.seen && typeof data.seen === 'object' ? data.seen : {},
            showFixOnly:
              typeof data?.showFixOnly === 'boolean' ? data.showFixOnly : null,
          },
        });
      },
      (error) => console.error("Failed to load what's new marks:", error),
    );
  }, [uid]);

  return loaded && loaded.uid === uid ? loaded.state : NOT_LOADED;
}

/** Remembers that the person has seen a scope's notes up to a version. */
export async function writeWhatsNewSeen(
  uid: string,
  scope: WhatsNewScope,
  version: string,
  doesExist: boolean,
) {
  const ref = doc(db, 'whatsNewSeen', uid);
  if (doesExist) {
    await updateDoc(ref, { [`seen.${scope}`]: version, updatedAt: Date.now() });
    return;
  }
  await setDoc(
    ref,
    {
      uid,
      seen: { [scope]: version },
      showFixOnly: null,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

export async function writeShowFixOnly(
  uid: string,
  showFixOnly: boolean,
  doesExist: boolean,
) {
  const ref = doc(db, 'whatsNewSeen', uid);
  if (doesExist) {
    await updateDoc(ref, { showFixOnly, updatedAt: Date.now() });
    return;
  }
  await setDoc(
    ref,
    { uid, seen: {}, showFixOnly, updatedAt: Date.now() },
    { merge: true },
  );
}
