const PREFIX = 'form-draft:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PlainDraft {
  savedAt: number;
  /** The record as the form opened it; a draft whose record has changed since is dropped. */
  base: string;
  value: unknown;
}

/** `{ base, value }` as JSON, sealed by the app that owns the form. */
interface SealedDraft {
  savedAt: number;
  sealed: object;
}

interface OpenedDraft {
  base: string;
  value: unknown;
}

/** Seals and opens a draft's text; built by the app that owns the key, so the key never reaches this module. */
export interface DraftSealer {
  seal: (text: string) => Promise<object>;
  open: (sealed: object) => Promise<string>;
}

const sealings = new Map<string, DraftSealer | null>();
const opened = new Map<string, OpenedDraft>();
const writeTurns = new Map<string, number>();

const toStorageKey = (uid: string, key: string) => `${PREFIX}${uid}:${key}`;

const isFresh = (savedAt: number) => Date.now() - savedAt <= MAX_AGE_MS;

function isPlainDraft(parsed: unknown): parsed is PlainDraft {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    typeof (parsed as PlainDraft).savedAt === 'number' &&
    typeof (parsed as PlainDraft).base === 'string' &&
    'value' in parsed
  );
}

function isSealedDraft(parsed: unknown): parsed is SealedDraft {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    typeof (parsed as SealedDraft).savedAt === 'number' &&
    typeof (parsed as SealedDraft).sealed === 'object' &&
    (parsed as SealedDraft).sealed !== null
  );
}

function readStored(storageKey: string): unknown {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const findSealing = (key: string) =>
  Array.from(sealings.entries()).find(([prefix]) => key.startsWith(prefix));

const nextTurn = (storageKey: string) => {
  const turn = (writeTurns.get(storageKey) ?? 0) + 1;
  writeTurns.set(storageKey, turn);
  return turn;
};

/**
 * Marks drafts whose key starts with `prefix` as sealed: they are kept only through the sealer
 * `unlockSealedFormDrafts` hands over, and nothing is kept until it has.
 */
export function declareSealedFormDrafts(prefix: string) {
  if (!sealings.has(prefix)) sealings.set(prefix, null);
}

/** Hands over the sealer for a sealed prefix and opens the drafts this account kept under it, so forms can start from them. */
export async function unlockSealedFormDrafts(
  uid: string,
  prefix: string,
  sealer: DraftSealer,
) {
  sealings.set(prefix, sealer);
  const storagePrefix = toStorageKey(uid, prefix);
  const storageKeys = Object.keys(window.localStorage).filter((storageKey) =>
    storageKey.startsWith(storagePrefix),
  );
  await Promise.all(
    storageKeys.map(async (storageKey) => {
      const parsed = readStored(storageKey);
      if (!isSealedDraft(parsed) || !isFresh(parsed.savedAt)) return;
      try {
        const text = await sealer.open(parsed.sealed);
        const draft: unknown = JSON.parse(text);
        const isShaped =
          typeof draft === 'object' &&
          draft !== null &&
          typeof (draft as OpenedDraft).base === 'string' &&
          'value' in draft;
        if (isShaped && !opened.has(storageKey)) {
          const { base, value } = draft as OpenedDraft;
          opened.set(storageKey, { base, value });
        }
      } catch {
        // A draft sealed with an older key stays unread and expires.
      }
    }),
  );
}

/** The value a form saved on this device for this account, or `null` when there is none, it is over a day old or its record has changed since. */
export function readFormDraft(
  uid: string,
  key: string,
  base: unknown,
): unknown {
  const storageKey = toStorageKey(uid, key);
  const baseText = JSON.stringify(base);
  if (findSealing(key)) {
    const draft = opened.get(storageKey);
    return draft && draft.base === baseText ? draft.value : null;
  }
  const parsed = readStored(storageKey);
  const isCurrent =
    isPlainDraft(parsed) && isFresh(parsed.savedAt) && parsed.base === baseText;
  return isCurrent ? parsed.value : null;
}

export function writeFormDraft(
  uid: string,
  key: string,
  base: unknown,
  value: unknown,
) {
  const storageKey = toStorageKey(uid, key);
  const baseText = JSON.stringify(base);
  const sealing = findSealing(key);
  if (!sealing) {
    try {
      const stored: PlainDraft = { savedAt: Date.now(), base: baseText, value };
      window.localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch {
      // A full or blocked storage only loses the safety copy; the form itself is unaffected.
    }
    return;
  }
  const [, sealer] = sealing;
  // Without the app's sealer nothing is kept, rather than keep it readable.
  if (sealer === null) return;
  opened.set(storageKey, { base: baseText, value });
  const turn = nextTurn(storageKey);
  void sealer
    .seal(JSON.stringify({ base: baseText, value }))
    .then((sealed) => {
      if (writeTurns.get(storageKey) !== turn) return;
      const stored: SealedDraft = { savedAt: Date.now(), sealed };
      window.localStorage.setItem(storageKey, JSON.stringify(stored));
    })
    .catch(() => undefined);
}

export function clearFormDraft(uid: string, key: string) {
  const storageKey = toStorageKey(uid, key);
  nextTurn(storageKey);
  opened.delete(storageKey);
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Nothing to clear.
  }
}

/** Removes every form draft this device kept for one account, as on sign-out. */
export function clearFormDrafts(uid: string) {
  const prefix = toStorageKey(uid, '');
  Array.from(writeTurns.keys())
    .filter((storageKey) => storageKey.startsWith(prefix))
    .forEach(nextTurn);
  Array.from(opened.keys())
    .filter((storageKey) => storageKey.startsWith(prefix))
    .forEach((storageKey) => opened.delete(storageKey));
  try {
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

/** One account's readable drafts whose key starts with `prefix`, newest first, for a row that offers to pick one up. */
export function listFormDrafts(uid: string, prefix: string): KeptFormDraft[] {
  try {
    const storagePrefix = toStorageKey(uid, prefix);
    const accountPrefix = toStorageKey(uid, '');
    return Object.keys(window.localStorage)
      .filter((storageKey) => storageKey.startsWith(storagePrefix))
      .flatMap((storageKey) => {
        const parsed = readStored(storageKey);
        return isPlainDraft(parsed) && isFresh(parsed.savedAt)
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
        const parsed = readStored(storageKey);
        const isKept =
          (isPlainDraft(parsed) || isSealedDraft(parsed)) &&
          isFresh(parsed.savedAt);
        if (!isKept) window.localStorage.removeItem(storageKey);
      });
  } catch {
    // Nothing to sweep.
  }
}
