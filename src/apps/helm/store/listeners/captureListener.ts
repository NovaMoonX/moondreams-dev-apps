import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentSnapshot,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { EARLIER_SESSIONS_PAGE } from '@apps/helm/constants';
import type {
  Capture,
  CaptureSealed,
  OpenCapture,
  ScreenContext,
} from '@apps/helm/types';
import { normalizeAnswer } from '@apps/helm/utils/captureAnswer';
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

const isRef = (value: unknown): value is ScreenContext['visible'][number] =>
  typeof value === 'object' &&
  value !== null &&
  (value as { collection?: unknown }).collection === 'tasks' &&
  typeof (value as { id?: unknown }).id === 'string';

/** An older turn has no screen, and one that is not shaped like the contract counts as none. */
const toScreen = (value: unknown): ScreenContext | null => {
  const screen = value as Partial<ScreenContext> | null;
  if (
    typeof screen !== 'object' ||
    screen === null ||
    typeof screen.view !== 'string' ||
    screen.v !== 1 ||
    !Array.isArray(screen.visible) ||
    !screen.visible.every(isRef) ||
    (screen.focus !== null && !isRef(screen.focus))
  ) {
    return null;
  }
  return screen as ScreenContext;
};

const toLeadId = (value: unknown) => (typeof value === 'string' ? value : null);

const toIds = (value: unknown) =>
  Array.isArray(value) && value.every((id) => typeof id === 'string')
    ? (value as string[])
    : [];

/** A turn that won't open is kept, with no words, so the surface can say so instead of dropping it. */
async function openCapture(
  entry: DocumentSnapshot,
  read: SealedReader,
  isMetadataTracked: boolean,
): Promise<OpenCapture> {
  const data = (entry.data() ?? {}) as Partial<Capture>;
  const base = {
    id: entry.id,
    inputMode: data.inputMode ?? 'typed',
    sttProvider: data.sttProvider ?? null,
    interruptedCaptureId: data.interruptedCaptureId ?? null,
    ttsProvider: data.ttsProvider ?? null,
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
    hasPendingWrites: isMetadataTracked && entry.metadata.hasPendingWrites,
    executionIds: data.executionIds ?? [],
    turnLeadId: toLeadId(data.turnLeadId),
    joinedCaptureIds: toIds(data.joinedCaptureIds),
    seenAt: data.seenAt ?? null,
    quotedSourceKeys: toIds(data.quotedSourceKeys),
    planDayKey: typeof data.planDayKey === 'string' ? data.planDayKey : null,
    createdAt: data.createdAt ?? 0,
    sortedAt: data.sortedAt ?? null,
    screen: toScreen(data.screen ?? null),
  } as const;
  try {
    if (!data.sealed) throw new Error('This turn has no sealed words.');
    const payload = await read<Partial<CaptureSealed>>(data.sealed);
    return {
      ...base,
      text: payload.text ?? '',
      reading: normalizeReading(payload.reading),
      answer: normalizeAnswer(payload.answer),
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      text: '',
      reading: EMPTY_READING,
      answer: null,
      isUnreadable: true,
    };
  }
}

/** One turn by id, opened; null when it is gone. */
export async function fetchCaptureById(
  uid: string,
  read: SealedReader,
  id: string,
) {
  const snapshot = await getDoc(doc(capturesOf(uid), id));
  return snapshot.exists() ? openCapture(snapshot, read, false) : null;
}

const openCaptures = (
  docs: QueryDocumentSnapshot[],
  read: SealedReader,
  isMetadataTracked = false,
) =>
  Promise.all(docs.map((entry) => openCapture(entry, read, isMetadataTracked)));

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
      const opened = await openCaptures(snapshot.docs, read, isMetadataTracked);
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
      orderBy('createdAt', 'desc'),
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
