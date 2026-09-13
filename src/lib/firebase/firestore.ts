import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type CollectionReference,
  type DocumentData,
} from 'firebase/firestore';

import { DEFAULT_INVITE_CODE_LENGTH, generateInviteCode } from '@/utils';

/** Random code guaranteed not to already exist as a doc in `collectionRef` — retries on collision. */
export async function getUniqueInviteCode(
  collectionRef: CollectionReference<DocumentData>,
  options: { length?: number; preferredCode?: string } = {},
): Promise<string> {
  const { length = DEFAULT_INVITE_CODE_LENGTH, preferredCode } = options;
  let candidate = preferredCode ?? generateInviteCode(length);

  while (true) {
    const snapshot = await getDoc(doc(collectionRef, candidate));

    if (!snapshot.exists()) {
      return candidate;
    }

    candidate = generateInviteCode(length);
  }
}

export async function ensureDocExists(
  docRef: ReturnType<typeof doc>,
  defaultData: Record<string, unknown>,
) {
  try {
    // If the document already exists, this is a no-op that preserves its current values.
    // The empty object means we intentionally do not overwrite any existing fields.
    await updateDoc(docRef, {});
  } catch (error) {
    // Firestore throws a 'not-found' error when the document does not exist yet.
    // In that case, we create the default record safely without touching any user-edited values.
    const firebaseError = error as { code?: string };

    if (firebaseError.code === 'not-found') {
      await setDoc(docRef, defaultData);
    }
  }
}
