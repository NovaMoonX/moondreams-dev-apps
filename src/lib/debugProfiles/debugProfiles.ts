import { deleteDoc, doc, setDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

/** `debugProfiles/{emailLower}`: someone who sees what failed on the error screen. */
export interface DebugProfile {
  email: string;
  addedAt: number;
  addedBy: string;
}

const REMEMBERED_PREFIX = 'debug-details:';

export const toDebugProfileId = (email: string) => email.trim().toLowerCase();

export const addDebugProfile = async (email: string, addedBy: string) => {
  const id = toDebugProfileId(email);
  const profile: DebugProfile = { email: id, addedAt: Date.now(), addedBy };
  await setDoc(doc(db, 'debugProfiles', id), profile);
};

export const removeDebugProfile = (email: string) =>
  deleteDoc(doc(db, 'debugProfiles', toDebugProfileId(email)));

/** The last answer for this account, so an error screen with no connection still knows. */
export const readRememberedDebugAnswer = (uid: string) => {
  try {
    return window.localStorage.getItem(REMEMBERED_PREFIX + uid) === 'true';
  } catch {
    return false;
  }
};

export const rememberDebugAnswer = (uid: string, canSee: boolean) => {
  try {
    window.localStorage.setItem(REMEMBERED_PREFIX + uid, String(canSee));
  } catch {
    // Storage can be full or blocked; the next fetch answers instead.
  }
};

export const clearRememberedDebugAnswer = (uid: string) => {
  try {
    window.localStorage.removeItem(REMEMBERED_PREFIX + uid);
  } catch {
    // Nothing was kept.
  }
};
