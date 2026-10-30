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

export interface KeptFormDraft {
  key: string;
  savedAt: number;
  value: unknown;
}

/** One account's drafts whose key starts with `prefix`, newest first, for a row that offers to pick one up. */
export function listFormDrafts(uid: string, prefix: string): KeptFormDraft[] {
  try {
    const storagePrefix = toStorageKey(uid, prefix);
    const accountPrefix = toStorageKey(uid, '');
    return Object.keys(window.localStorage)
      .filter((storageKey) => storageKey.startsWith(storagePrefix))
      .flatMap((storageKey) => {
        const parsed: unknown = JSON.parse(
          window.localStorage.getItem(storageKey) ?? 'null',
        );
        return isStoredDraft(parsed) &&
          Date.now() - parsed.savedAt <= MAX_AGE_MS
          ? [
              {
                key: storageKey.slice(accountPrefix.length),
                savedAt: parsed.savedAt,
                value: parsed.value,
              },
            ]
          : [];
      })
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** Removes every draft on this device that is over a day old, whoever kept it. */
export function sweepFormDrafts() {
  try {
    Object.keys(window.localStorage)
      .filter((storageKey) => storageKey.startsWith(PREFIX))
      .forEach((storageKey) => {
        const parsed: unknown = JSON.parse(
          window.localStorage.getItem(storageKey) ?? 'null',
        );
        if (
          !isStoredDraft(parsed) ||
          Date.now() - parsed.savedAt > MAX_AGE_MS
        ) {
          window.localStorage.removeItem(storageKey);
        }
      });
  } catch {
    // Nothing to sweep.
  }
}
