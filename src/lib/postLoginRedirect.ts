const STORAGE_KEY = 'postLoginRedirect';
// Long enough to survive a real sign-in flow (popup + Firestore roundtrips),
// short enough that a stale/abandoned entry can't hijack a later, unrelated
// sign-in in the same tab.
const MAX_AGE_MS = 10 * 60 * 1000;

interface StoredRedirect {
  destination: string;
  savedAt: number;
}

/**
 * Remembers where an unauthenticated user was trying to go so they can be
 * sent back there once they sign in, instead of landing on the home page and
 * losing (e.g.) an invite code in the URL. Centralized so every mini-app's
 * join-link flow behaves the same way.
 */
export function savePostLoginRedirect(destination: string) {
  if (!destination || destination === '/') {
    return;
  }

  try {
    const payload: StoredRedirect = { destination, savedAt: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage can throw (private browsing, storage disabled) — losing
    // the redirect just falls back to landing on home, which is fine.
  }
}

/** Reads and clears the saved destination in one step so it can only ever fire once. */
export function consumePostLoginRedirect(): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredRedirect>;
    if (
      typeof parsed.destination !== 'string' ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > MAX_AGE_MS
    ) {
      return null;
    }

    return parsed.destination;
  } catch {
    return null;
  }
}
