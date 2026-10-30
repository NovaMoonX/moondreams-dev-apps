const PREFIX = 'form-draft:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface StoredDraft {
  savedAt: number;
  /** The record as the form opened it; a draft whose record has changed since is dropped. */
  base: string;
  value: unknown;
}

const toStorageKey = (uid: string, key: string) => `${PREFIX}${uid}:${key}`;

function isStoredDraft(parsed: unknown): parsed is StoredDraft {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    typeof (parsed as StoredDraft).savedAt === 'number' &&
    typeof (parsed as StoredDraft).base === 'string' &&
    'value' in parsed
  );
}

/** The value a form saved on this device for this account, or `null` when there is none, it is over a day old or its record has changed since. */
export function readFormDraft(
  uid: string,
  key: string,
  base: unknown,
): unknown {
  try {
    const raw = window.localStorage.getItem(toStorageKey(uid, key));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const isCurrent =
      isStoredDraft(parsed) &&
      Date.now() - parsed.savedAt <= MAX_AGE_MS &&
      parsed.base === JSON.stringify(base);
    return isCurrent ? parsed.value : null;
  } catch {
    return null;
  }
}

/** A draft's value without checking its record, for a header drawn before the form that owns it opens. */
export function peekFormDraft(uid: string, key: string): unknown {
  try {
    const raw = window.localStorage.getItem(toStorageKey(uid, key));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const isFresh =
      isStoredDraft(parsed) && Date.now() - parsed.savedAt <= MAX_AGE_MS;
    return isFresh ? parsed.value : null;
  } catch {
    return null;
  }
}

export function writeFormDraft(
  uid: string,
  key: string,
  base: unknown,
  value: unknown,
) {
  try {
    const stored: StoredDraft = {
      savedAt: Date.now(),
      base: JSON.stringify(base),
      value,
    };
    window.localStorage.setItem(toStorageKey(uid, key), JSON.stringify(stored));
  } catch {
    // A full or blocked storage only loses the safety copy; the form itself is unaffected.
  }
}

export function clearFormDraft(uid: string, key: string) {
  try {
    window.localStorage.removeItem(toStorageKey(uid, key));
  } catch {
    // Nothing to clear.
  }
}

/** Removes every form draft this device kept for one account, as on sign-out. */
export function clearFormDrafts(uid: string) {
  try {
    const prefix = toStorageKey(uid, '');
    Object.keys(window.localStorage)
      .filter((storageKey) => storageKey.startsWith(prefix))
      .forEach((storageKey) => window.localStorage.removeItem(storageKey));
  } catch {
    // Nothing to clear.
  }
}
