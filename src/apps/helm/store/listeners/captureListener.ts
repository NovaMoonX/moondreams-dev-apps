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
  HelmQuestion,
  OpenCapture,
  ScreenContext,
} from '@apps/helm/types';
import { normalizeAnswer } from '@apps/helm/utils/captureAnswer';
import {
  EMPTY_READING,
  normalizeReading,
} from '@apps/helm/utils/captureReading';
import { groupSessions } from '@apps/helm/utils/sessions';
import { readPrivacy } from '@apps/helm/utils/privacy';

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

const isOption = (value: unknown) => {
  const option = value as Partial<HelmQuestion['options'][number]> | null;
  return (
    typeof option === 'object' &&
    option !== null &&
    typeof option.id === 'string' &&
    typeof option.label === 'string'
  );
};

const SHAPES = [
  'pickOne',
  'pickSeveral',
  'yesNo',
  'freeText',
  'dateTime',
  'pickRecord',
  'number',
];

const toRecordKinds = (value: unknown): HelmQuestion['recordKinds'] =>
  Array.isArray(value)
    ? value.filter(
        (kind): kind is 'who' | 'place' => kind === 'who' || kind === 'place',
      )
    : [];

/** Opens the questions a turn asked, in the shape the cards draw, filling what an older one lacks; one that is not shaped like the contract is left out. */
const toQuestions = (value: unknown): Record<string, HelmQuestion> =>
  Object.fromEntries(
    Object.entries(
      typeof value === 'object' && value !== null ? value : {},
    ).flatMap(([id, entry]) => {
      const question = entry as Partial<HelmQuestion> | null;
      const isKnown =
        question?.kind === 'whichPerson' ||
        question?.kind === 'whichPlace' ||
        question?.kind === 'isThisWho' ||
        question?.kind === 'whichKin' ||
        question?.kind === 'kinOrder' ||
        question?.kind === 'whichIsTrue' ||
        question?.kind === 'whichTopic' ||
        question?.kind === 'groupTopics' ||
        question?.kind === 'asked';
      return typeof question === 'object' &&
        question !== null &&
        isKnown &&
        typeof question.prompt === 'string' &&
        Array.isArray(question.options) &&
        question.options.every(isOption)
        ? [
            [
              id,
              {
                ...question,
                builtBy: question.kind === 'asked' ? 'model' : 'code',
                shape: SHAPES.includes(question.shape ?? '')
                  ? question.shape
                  : 'pickOne',
                options: question.options.map((option) => ({
                  ...option,
                  detail: option.detail ?? null,
                  ref: option.ref ?? null,
                })),
                allowsSomethingElse: question.allowsSomethingElse ?? false,
                noneOption: question.noneOption ?? false,
                recordKinds: toRecordKinds(question.recordKinds),
                dateMode: question.dateMode ?? null,
                number: question.number ?? null,
                aboutRef: question.aboutRef ?? null,
                answer: question.answer ?? null,
              } as HelmQuestion,
            ],
          ]
        : [];
    }),
  );

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
  const data = (entry.data() ?? {}) as Partial<Capture> & {
    endedConversation?: boolean;
  };
  const base = {
    id: entry.id,
    inputMode: data.inputMode ?? 'typed',
    sttProvider: data.sttProvider ?? null,
    interruptedCaptureId: data.interruptedCaptureId ?? null,
    answersQuestion: data.answersQuestion ?? null,
    ttsProvider: data.ttsProvider ?? null,
    arrivedVia: data.arrivedVia === 'dropBox' ? 'dropBox' : 'direct',
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
    attachmentIds: toIds(data.attachmentIds),
    seenAt: data.seenAt ?? null,
    quotedSourceKeys: toIds(data.quotedSourceKeys),
    answerSavedNoteId:
      typeof data.answerSavedNoteId === 'string'
        ? data.answerSavedNoteId
        : null,
    whoIds: toIds(data.whoIds),
    placeIds: toIds(data.placeIds),
    planDayKey: typeof data.planDayKey === 'string' ? data.planDayKey : null,
    createdAt: data.createdAt ?? 0,
    privacy: readPrivacy(data.privacy),
    touchesPrivate: data.touchesPrivate ?? null,
    presence: data.presence ?? null,
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
      questions: toQuestions(payload.questions),
      line:
        typeof payload.spoken?.text === 'string' ? payload.spoken.text : null,
      isUnreadable: false,
      endedConversation: data.endedConversation === true,
    };
  } catch {
    return {
      ...base,
      text: '',
      reading: EMPTY_READING,
      answer: null,
      questions: {},
      line: null,
      isUnreadable: true,
      endedConversation: data.endedConversation === true,
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
