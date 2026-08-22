import { doc, setDoc, updateDoc } from 'firebase/firestore';

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
