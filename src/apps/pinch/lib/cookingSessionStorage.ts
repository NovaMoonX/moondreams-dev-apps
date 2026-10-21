import {
  getCookingSessionKey,
  parseCookingSnapshot,
  type CookingSnapshot,
} from '@apps/pinch/utils/cookSession';

/** A saved cooking session of this person, dropped from storage when it is too old or not what was written. Browser storage only; a browser without it reads as no session. */
export const readCookingSession = (uid: string, now: number) => {
  try {
    const key = getCookingSessionKey(uid);
    const raw = window.localStorage.getItem(key);
    const snapshot = parseCookingSnapshot(raw, uid, now);
    if (raw !== null && snapshot === null) window.localStorage.removeItem(key);
    return snapshot;
  } catch {
    return null;
  }
};

export const writeCookingSession = (snapshot: CookingSnapshot) => {
  try {
    window.localStorage.setItem(
      getCookingSessionKey(snapshot.uid),
      JSON.stringify(snapshot),
    );
  } catch {
    // The cook goes on without a saved copy.
  }
};

export const clearCookingSession = (uid: string) => {
  try {
    window.localStorage.removeItem(getCookingSessionKey(uid));
  } catch {
    // Nothing was saved that could be removed.
  }
};
