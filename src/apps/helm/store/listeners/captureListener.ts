import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { EARLIER_SESSIONS_PAGE } from '@apps/helm/constants';
import type { Capture, CaptureSealed, OpenCapture } from '@apps/helm/types';
import {
  EMPTY_READING,
  normalizeReading,
} from '@apps/helm/utils/captureReading';
import { groupSessions } from '@apps/helm/utils/sessions';

const EARLIER_FETCH_LIMIT = 200;
const UNSEEN_LIMIT = 200;
const WAITING_LIMIT = 200;

const capturesOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'captures');

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your turns did not open.');

/** A turn that won't open is kept, with no words, so the surface can say so instead of dropping it. */
async function openCapture(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenCapture> {
  const data = entry.data() as Partial<Capture>;
  const base = {
    id: entry.id,
    inputMode: data.inputMode ?? 'typed',
    medium: data.medium ?? 'web',
    sessionId: data.sessionId ?? entry.id,
    turnIndex: data.turnIndex ?? 0,
    route: data.route ?? null,
    status: data.status ?? 'received',
    heldReason: data.heldReason ?? null,
    claimId: data.claimId ?? null,
    claimedAt: data.claimedAt ?? null,
    attempts: data.attempts ?? 0,
    lastErrorCode: data.lastErrorCode ?? null,
    questionState: data.questionState ?? {},
    hasPendingWrites: entry.metadata.hasPendingWrites,
    executionIds: data.executionIds ?? [],
    seenAt: data.seenAt ?? null,
    createdAt: data.createdAt ?? 0,
    sortedAt: data.sortedAt ?? null,
  } as const;
  try {
    if (!data.sealed) throw new Error('This turn has no sealed words.');
    const payload = await read<Partial<CaptureSealed>>(data.sealed);
    return {
      ...base,
      text: payload.text ?? '',
      reading: normalizeReading(payload.reading),
      isUnreadable: false,
    };
  } catch {
    return { ...base, text: '', reading: EMPTY_READING, isUnreadable: true };
  }
}

const openCaptures = (docs: QueryDocumentSnapshot[], read: SealedReader) =>
  Promise.all(docs.map((entry) => openCapture(entry, read)));

/** A live query over turns. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
function startCapturesListener(
  uid: string,
  read: SealedReader,
  constraints: QueryConstraint[],
  onChange: (captures: OpenCapture[]) => void,
  onError: (error: Error) => void,
  isMetadataTracked = false,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(capturesOf(uid), ...constraints),
    { includeMetadataChanges: isMetadataTracked },
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await openCaptures(snapshot.docs, read);
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}

/** Turns from `windowStart` on: the current session and the one before it. */
export const startRecentCapturesListener = (
  uid: string,
  read: SealedReader,
  windowStart: number,
  onChange: (captures: OpenCapture[]) => void,
  onError: (error: Error) => void,
) =>
  startCapturesListener(
    uid,
    read,
    [where('createdAt', '>=', windowStart), orderBy('createdAt', 'asc')],
    onChange,
    onError,
  );

/** The newest turns the person hasn't seen yet, at most a page of them. */
export const startUnseenCapturesListener = (
  uid: string,
  read: SealedReader,
  onChange: (captures: OpenCapture[]) => void,
  onError: (error: Error) => void,
) =>
  startCapturesListener(
    uid,
    read,
    [
      where('seenAt', '==', null),
      orderBy('createdAt', 'desc'),
      limit(UNSEEN_LIMIT),
    ],
    onChange,
    onError,
  );

/** Turns that still need something, whenever they were said: waiting to be read, being read, failed or asking the person. The metadata is tracked so a turn still on this device says so. */
export const startWaitingCapturesListener = (
  uid: string,
  read: SealedReader,
  onChange: (captures: OpenCapture[]) => void,
  onError: (error: Error) => void,
) =>
  startCapturesListener(
    uid,
    read,
    [
      where('status', 'in', ['received', 'interpreting', 'needsYou', 'failed']),
      limit(WAITING_LIMIT),
    ],
    onChange,
    onError,
    true,
  );

/** The next sessions older than `before`, whole ones only: a session cut by the fetch's end waits for the next page. */
export async function loadEarlierCaptures(
  uid: string,
  read: SealedReader,
  before: number,
) {
  const snapshot = await getDocs(
    query(
      capturesOf(uid),
      where('createdAt', '<', before),
      orderBy('createdAt', 'desc'),
      limit(EARLIER_FETCH_LIMIT),
    ),
  );
  const isMore = snapshot.size === EARLIER_FETCH_LIMIT;
  const opened = await openCaptures(snapshot.docs, read);
  const sessions = groupSessions(opened).reverse();
  const whole =
    isMore && sessions.length > 1 ? sessions.slice(0, -1) : sessions;
  const page = whole.slice(0, EARLIER_SESSIONS_PAGE);
  const result = {
    captures: page.flatMap((session) => session.turns),
    isExhausted: !isMore && whole.length <= EARLIER_SESSIONS_PAGE,
  };
  return result;
}
