import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@lib/firebase/config';
import type { Personality } from '@apps/helm/engine/personality';

const previewCallable = httpsCallable<
  { personality: Personality },
  { replies: string[]; hash: string }
>(functions, 'previewHelmPersonality');

/** Writes how the assistant talks; only these fields change, so it never races another setting. */
export const setPersonality = (uid: string, personality: Personality) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    personality,
    personalitySetAt: Date.now(),
    lastEditedAt: Date.now(),
  });

/** Sample replies to the fixed prompts in this personality, made by the server. */
export const askPersonalityPreview = (personality: Personality) =>
  previewCallable({ personality }).then((result) => result.data);
