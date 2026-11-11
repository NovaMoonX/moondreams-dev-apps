import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';
import {
  canKeepDeviceSecrets,
  forgetDeviceSecret,
  keepDeviceSecret,
  readDeviceSecret,
} from '@lib/security';

import { generateUuid } from '@/utils/idUtils';
import type { CaptureReading } from '@apps/helm/types';
import {
  readDropBoxKey,
  readEnvelope,
  sealToDropBox,
  type DropBoxEnvelope,
} from '@apps/helm/utils/dropBox';

const OUTBOX_SECRET = 'helmOutbox';
const DROP_BOX_KEY_SECRET = 'helmDropBoxKey';
const FLUSH_BATCH = 20;

export interface OutboxEntry {
  id: string;
  createdAt: number;
}

const importCallable = httpsCallable<
  { items: DropBoxEnvelope[] },
  { held: string[]; rejected: string[] }
>(functions, 'importHelmOutbox');

const state = {
  uid: null as string | null,
  entries: [] as OutboxEntry[],
  words: new Map<string, string>(),
  isFlushing: false,
  queue: Promise.resolve() as Promise<unknown>,
};
const listeners = new Set<() => void>();

export const subscribeOutbox = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const setEntries = (uid: string, envelopes: DropBoxEnvelope[]) => {
  state.uid = uid;
  state.entries = envelopes.map(({ id, createdAt }) => ({ id, createdAt }));
  listeners.forEach((listener) => listener());
};

const EMPTY: OutboxEntry[] = [];

export const getOutboxEntries = (uid: string | null) =>
  uid !== null && state.uid === uid ? state.entries : EMPTY;

/** The words of a saved thing, only while the session that typed them is still open. */
export const getOutboxWords = (id: string) => state.words.get(id) ?? null;

// A read-then-write of the one kept list never overlaps another.
const serial = <T>(work: () => Promise<T>) => {
  const next = state.queue.catch(() => undefined).then(work);
  state.queue = next;
  return next;
};

async function readOutbox(uid: string): Promise<DropBoxEnvelope[]> {
  const kept = await readDeviceSecret(uid, OUTBOX_SECRET);
  if (!kept) return [];
  try {
    const parsed: unknown = JSON.parse(kept);
    return Array.isArray(parsed)
      ? parsed.flatMap((item) => readEnvelope(item) ?? [])
      : [];
  } catch {
    return [];
  }
}

async function writeOutbox(uid: string, envelopes: DropBoxEnvelope[]) {
  if (envelopes.length === 0) await forgetDeviceSecret(uid, OUTBOX_SECRET);
  else await keepDeviceSecret(uid, OUTBOX_SECRET, JSON.stringify(envelopes));
  setEntries(uid, envelopes);
}

/** Puts the saved things this device holds for the person into view. */
export const loadOutbox = (uid: string) =>
  serial(async () => {
    if (!canKeepDeviceSecrets()) return;
    setEntries(uid, await readOutbox(uid));
  });

/** Keeps the person's drop-box key on this device on every online open; a key that isn't shaped like one is ignored. */
export async function keepDropBoxKey(uid: string, value: unknown) {
  const key = readDropBoxKey(value);
  if (!key || !canKeepDeviceSecrets()) return;
  await keepDeviceSecret(uid, DROP_BOX_KEY_SECRET, JSON.stringify(key)).catch(
    () => undefined,
  );
}

async function readDropBoxKeyKept(uid: string) {
  const kept = await readDeviceSecret(uid, DROP_BOX_KEY_SECRET);
  if (!kept) return null;
  try {
    return readDropBoxKey(JSON.parse(kept));
  } catch {
    return null;
  }
}

/** Whether a capture can be kept sealed on this device with no key: a secure page that keeps secrets, and the key kept on an earlier online open. */
export async function canUseDropBox(uid: string) {
  return canKeepDeviceSecrets() && (await readDropBoxKeyKept(uid)) !== null;
}

/** Seals the words to the drop-box key and adds them to the saved list; throws when nothing could be kept, so the words stay in the field. */
export function saveToOutbox(
  uid: string,
  turn: {
    text: string;
    reading: CaptureReading;
    inputMode: 'typed' | 'voice';
    createdAt: number;
  },
) {
  return serial(async () => {
    const key = await readDropBoxKeyKept(uid);
    if (!key || !canKeepDeviceSecrets()) {
      throw new Error('No drop-box key is kept on this device.');
    }
    const captureId = generateUuid();
    const envelope = await sealToDropBox(uid, key, {
      captureId,
      ...turn,
    });
    state.words.set(captureId, turn.text);
    await writeOutbox(uid, [...(await readOutbox(uid)), envelope]).catch(
      (error: unknown) => {
        state.words.delete(captureId);
        throw error;
      },
    );
    return { id: captureId };
  });
}

async function sendBatch(uid: string): Promise<number> {
  const waiting = await serial(() => readOutbox(uid));
  if (waiting.length === 0) return 0;
  const { data } = await importCallable({
    items: waiting.slice(0, FLUSH_BATCH),
  });
  const done = new Set([...data.held, ...data.rejected]);
  if (done.size === 0) return 0;
  await serial(async () =>
    writeOutbox(
      uid,
      (await readOutbox(uid)).filter((envelope) => !done.has(envelope.id)),
    ),
  );
  done.forEach((id) => state.words.delete(id));
  return (
    data.rejected.length +
    (waiting.length > FLUSH_BATCH ? await sendBatch(uid) : 0)
  );
}

/** Sends what is waiting to be opened and filed; what the server holds, or can never take, leaves the list. Returns how many it could never take. */
export async function flushOutbox(uid: string) {
  if (state.isFlushing || !navigator.onLine || !canKeepDeviceSecrets()) {
    return 0;
  }
  state.isFlushing = true;
  try {
    return await sendBatch(uid);
  } finally {
    state.isFlushing = false;
  }
}

/** How many saved things this device holds for the person right now, read from what is kept. */
export const countOutbox = async (uid: string) =>
  canKeepDeviceSecrets() ? (await readOutbox(uid)).length : 0;
