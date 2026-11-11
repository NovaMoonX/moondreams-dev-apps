import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';
import {
  canKeepDeviceSecrets,
  forgetDeviceSecret,
  keepDeviceSecret,
  readDeviceSecret,
} from '@lib/security';

import { setPendingDeviceWork } from '@/lib/auth/signOutChecks';
import { store } from '@/store';
import { generateUuid } from '@/utils/idUtils';
import { DEFAULT_ASSISTANT_NAME, HELM_COPY } from '@apps/helm/constants';
import { readAssistantName } from '@apps/helm/utils/assistantName';
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
const PENDING_MARKER = 'helmOutbox';

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

const switchTo = (uid: string) => {
  if (state.uid === uid) return;
  state.uid = uid;
  state.entries = [];
  state.words.clear();
};

/** Keeps the sign-out question where the app never loaded can still find it, holding the count and never the words. */
const markPending = (uid: string, count: number) => {
  const name =
    readAssistantName(store.getState().helm.profile?.assistantName) ??
    DEFAULT_ASSISTANT_NAME;
  setPendingDeviceWork(
    uid,
    PENDING_MARKER,
    count === 0
      ? null
      : {
          count,
          question: {
            title: HELM_COPY.outboxSignOutTitle(count),
            message: HELM_COPY.outboxSignOutBody(count, name),
            confirmText: HELM_COPY.outboxSignOutConfirm,
            cancelText: HELM_COPY.outboxStay,
          },
        },
  );
};

const setEntries = (uid: string, envelopes: DropBoxEnvelope[]) => {
  switchTo(uid);
  state.entries = envelopes.map(({ id, createdAt }) => ({ id, createdAt }));
  markPending(uid, envelopes.length);
  listeners.forEach((listener) => listener());
};

const EMPTY: OutboxEntry[] = [];

export const getOutboxEntries = (uid: string | null) =>
  uid !== null && state.uid === uid ? state.entries : EMPTY;

/** The words of a saved thing, only while the session that typed them is still open. */
export const getOutboxWords = (id: string) => state.words.get(id) ?? null;

const lockName = (uid: string, part: string) => `helm-outbox:${uid}:${part}`;

// A read-then-write of the one kept list never overlaps another, in this tab or in another one.
const serial = <T>(uid: string, work: () => Promise<T>) => {
  const locked = () =>
    'locks' in navigator
      ? navigator.locks.request(lockName(uid, 'list'), work)
      : work();
  const next = state.queue.catch(() => undefined).then(locked);
  state.queue = next;
  return next;
};

/** Throws when what is kept can't be read, so a save fails with the words still in the field and a send leaves the list alone. */
async function readOutbox(uid: string): Promise<DropBoxEnvelope[]> {
  const kept = await readDeviceSecret(uid, OUTBOX_SECRET, Infinity, {
    throwsOnStoreError: true,
  });
  if (!kept) return [];
  const parsed: unknown = JSON.parse(kept);
  if (!Array.isArray(parsed)) throw new Error('The kept list is not a list.');
  return parsed.flatMap((item) => readEnvelope(item) ?? []);
}

async function writeOutbox(uid: string, envelopes: DropBoxEnvelope[]) {
  if (envelopes.length === 0) await forgetDeviceSecret(uid, OUTBOX_SECRET);
  else await keepDeviceSecret(uid, OUTBOX_SECRET, JSON.stringify(envelopes));
  setEntries(uid, envelopes);
}

/** Puts the saved things this device holds for the person into view. */
export const loadOutbox = (uid: string) =>
  serial(uid, async () => {
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
  return serial(uid, async () => {
    switchTo(uid);
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

const dropFromList = (uid: string, ids: ReadonlySet<string>) =>
  serial(uid, async () =>
    writeOutbox(
      uid,
      (await readOutbox(uid)).filter((envelope) => !ids.has(envelope.id)),
    ),
  );

/** Takes one saved thing off this device for good, with its words. */
export async function removeFromOutbox(uid: string, id: string) {
  await dropFromList(uid, new Set([id]));
  state.words.delete(id);
}

async function sendBatch(
  uid: string,
): Promise<{ sent: number; rejected: number }> {
  const waiting = await serial(uid, () => readOutbox(uid));
  if (waiting.length === 0) return { sent: 0, rejected: 0 };
  const { data } = await importCallable({
    items: waiting.slice(0, FLUSH_BATCH),
  });
  const done = new Set([...data.held, ...data.rejected]);
  if (done.size === 0) return { sent: 0, rejected: 0 };
  await dropFromList(uid, done);
  done.forEach((id) => state.words.delete(id));
  const rest =
    waiting.length > FLUSH_BATCH
      ? await sendBatch(uid)
      : { sent: 0, rejected: 0 };
  return {
    sent: data.held.length + rest.sent,
    rejected: data.rejected.length + rest.rejected,
  };
}

/** Sends what is waiting to be opened and filed; what the server holds, or can never take, leaves the list. Returns how many it sent and how many it could never take. */
export async function flushOutbox(uid: string) {
  const none = { sent: 0, rejected: 0 };
  if (state.isFlushing || !navigator.onLine || !canKeepDeviceSecrets()) {
    return none;
  }
  state.isFlushing = true;
  try {
    // Another tab already sending the same list makes this one wait for its next turn.
    return 'locks' in navigator
      ? ((await navigator.locks.request(
          lockName(uid, 'flush'),
          { ifAvailable: true },
          async (lock) => (lock ? sendBatch(uid) : none),
        )) as typeof none)
      : await sendBatch(uid);
  } finally {
    state.isFlushing = false;
  }
}
