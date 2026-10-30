const PREFIX = 'form-draft:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface StoredDraft {
  savedAt: number;
  value: unknown;
}

const toStorageKey = (uid: string, key: string) => `${PREFIX}${uid}:${key}`;

function isStoredDraft(parsed: unknown): parsed is StoredDraft {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    typeof (parsed as StoredDraft).savedAt === 'number' &&
    'value' in parsed
  );
}

/** The value a form saved on this device for this account, or `null` when there is none or it is over a day old. */
export function readFormDraft(uid: string, key: string): unknown {
  try {
    const raw = window.localStorage.getItem(toStorageKey(uid, key));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!isStoredDraft(parsed) || Date.now() - parsed.savedAt > MAX_AGE_MS)
      return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export function writeFormDraft(uid: string, key: string, value: unknown) {
  try {
    const stored: StoredDraft = { savedAt: Date.now(), value };
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
