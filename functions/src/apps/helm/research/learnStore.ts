import type {
  Firestore,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore';

import { openForHelm, type HelmKey } from '../helmKey.js';
import type { SealedPayload } from '../../../appKeys/seal.js';

const READ_LIMIT = 100;
export const MAX_CONTEXT_LEARN = 30;
const OPEN = new Set(['planned', 'preparing', 'ready', 'offered']);

export interface LearnOfferEntry {
  at: number;
  dayKind: 'weekday' | 'weekend' | null;
  gapMinutes: number | null;
  afterBusyDay: boolean | null;
  outcome: 'yes' | 'notNow';
}

/** A learn-later item as the planner reads it: the readable fields with its sealed words opened. */
export interface LearnItem {
  id: string;
  status: string;
  question: string;
  subject: string;
  moreAsked: string[];
  contextLine: string | null;
  notNowStreak: number;
  declineReason: string | null;
  offers: LearnOfferEntry[];
  relatedOfferedAt: Record<string, number>;
  mergedInto: string | null;
  removedAt: number | null;
  needsLiveFacts: boolean;
  createdAt: number;
  /** The whole sealed record, so a rewrite keeps what it doesn't change. */
  sealed: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const toStrings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

/** A learn-later document with its words opened, or null when it is another mode or its words won't open. */
export function openLearnItem(
  key: HelmKey,
  doc: Pick<QueryDocumentSnapshot, 'id' | 'data'>,
): LearnItem | null {
  const data = doc.data();
  if (data.mode !== 'learnLater') return null;
  try {
    const sealed = openForHelm(key, data.sealed as SealedPayload);
    if (
      typeof sealed.question !== 'string' ||
      typeof sealed.subject !== 'string'
    ) {
      return null;
    }
    return {
      id: doc.id,
      status: String(data.status ?? ''),
      question: sealed.question,
      subject: sealed.subject,
      moreAsked: toStrings(sealed.moreAsked),
      contextLine:
        typeof sealed.contextLine === 'string' ? sealed.contextLine : null,
      notNowStreak: toNumber(data.notNowStreak),
      declineReason:
        typeof data.declineReason === 'string' ? data.declineReason : null,
      offers: Array.isArray(data.offers)
        ? (data.offers.filter(isRecord) as unknown as LearnOfferEntry[])
        : [],
      relatedOfferedAt: isRecord(data.relatedOfferedAt)
        ? Object.fromEntries(
            Object.entries(data.relatedOfferedAt).filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === 'number',
            ),
          )
        : {},
      mergedInto: typeof data.mergedInto === 'string' ? data.mergedInto : null,
      removedAt: typeof data.removedAt === 'number' ? data.removedAt : null,
      needsLiveFacts: data.needsLiveFacts === true,
      createdAt: toNumber(data.createdAt),
      sealed,
    };
  } catch {
    return null;
  }
}

/** Whether an item still counts as the person's open wish: not done, not removed, not folded into another. */
export const isOpenLearn = (item: LearnItem) =>
  OPEN.has(item.status) && item.mergedInto === null;

/** Every learn-later item the person has (up to 100, newest first), read inside the turn's transaction so a merge sees what is there now. Removed ones come too: the planner revives a subject said again and never relates a removed one. */
export const readLearnItemsIn = async (
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  key: HelmKey,
): Promise<LearnItem[]> => {
  const snap = await transaction.get(
    firestore
      .collection(`${base}/research`)
      .where('mode', '==', 'learnLater')
      .orderBy('createdAt', 'desc')
      .limit(READ_LIMIT),
  );
  return snap.docs.flatMap((doc) => {
    const item = openLearnItem(key, doc);
    return item ? [item] : [];
  });
};

/** One open item as the model sees it. */
export interface ContextLearnItem {
  id: string;
  subject: string;
  status: string;
  saved: string;
}

const toDayKey = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));

/** The person's open learn-later items for the model to name by alias, at most 30, newest first. An item let go (lostInterest), done or folded into another is never listed. */
export const readContextLearnLater = async (
  firestore: Firestore,
  base: string,
  key: HelmKey,
  timeZone: string,
): Promise<ContextLearnItem[]> => {
  const snap = await firestore
    .collection(`${base}/research`)
    .where('mode', '==', 'learnLater')
    .orderBy('createdAt', 'desc')
    .limit(READ_LIMIT)
    .get();
  return snap.docs
    .flatMap((doc) => {
      const item = openLearnItem(key, doc);
      return item && isOpenLearn(item)
        ? [
            {
              id: item.id,
              subject: item.subject,
              status: item.status,
              saved: toDayKey(item.createdAt, timeZone),
            },
          ]
        : [];
    })
    .slice(0, MAX_CONTEXT_LEARN);
};
