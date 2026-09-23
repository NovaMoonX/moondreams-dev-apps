const STORAGE_KEY = 'postLoginRedirect';
// Expires stale entries so an abandoned one can't hijack a later sign-in
const MAX_AGE_MS = 10 * 60 * 1000;

interface StoredRedirect {
  destination: string;
  savedAt: number;
}

export function savePostLoginRedirect(destination: string) {
  if (!destination || destination === '/') {
    return;
  }

  try {
    const payload: StoredRedirect = { destination, savedAt: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    return;
  }
}

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
