import type { Firestore } from 'firebase-admin/firestore';

import {
  createOptionMatcher,
  toComparable,
} from '../../../vendor/optionMatchUtils.js';
import {
  openWithKey,
  unwrapPlanKey,
  type Keyring,
  type SealedPayload,
} from '../planKey.js';

const SCAN_LIMIT = 500;
const ROW_LIMIT = 20;
const DAY_MS = 86_400_000;
const MAX_MONTHS = 13;
const DEFAULT_DAYS = 30;
const NAME_LIMIT = 120;
const ENVELOPE_CHUNK = 30;
const FREE_TO_SPEND = 'Free to Spend';

export interface TransactionRow {
  id: string;
  date: number;
  payee: string;
  amountCents: number;
  category: string | null;
}

export interface TransactionRead {
  rows: TransactionRow[];
  matchedCount: number;
  totalCents: number;
  currency: string | null;
  isPartial: boolean;
}

interface Opened {
  id: string;
  date: number;
  sealed: Record<string, unknown>;
}

const payeeMatcher = createOptionMatcher<string>();

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readText = (value: unknown) =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim().slice(0, NAME_LIMIT)
    : null;

const isSealed = (value: unknown): value is SealedPayload => {
  const sealed = asObject(value);
  return (
    sealed !== null &&
    typeof sealed.value === 'string' &&
    typeof sealed.nonce === 'string'
  );
};

const readDay = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().startsWith(value)
    ? at
    : null;
};

const monthsBefore = (day: number, months: number) => {
  const at = new Date(day);
  at.setUTCMonth(at.getUTCMonth() - months);
  return at.getTime();
};

/** The days asked for as UTC midnights, a missing or malformed end defaulting to today and a missing start to 30 days before it, and a longer stretch than 13 months cut to its newest 13. */
export const readRange = (args: unknown, now: number) => {
  const asked = asObject(args);
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const to = readDay(asked?.to) ?? today;
  const from = Math.max(
    readDay(asked?.from) ?? to - DEFAULT_DAYS * DAY_MS,
    monthsBefore(to, MAX_MONTHS),
  );
  return { from, to };
};

const readPayeeFilter = (args: unknown) => readText(asObject(args)?.payee);

const readPayee = (sealed: Record<string, unknown>) =>
  readText(sealed.label) ?? readText(sealed.merchant);

/** A typed payee fits a name when the matcher settles on it, or when each of its words is a whole word of the name ("Costco" for "Costco Wholesale"). */
const isPayeeMatch = (typed: string, names: string[]) => {
  const wanted = toComparable(typed).split(' ').filter(Boolean);
  return names.some((name) => {
    const words = new Set(toComparable(name).split(' '));
    return (
      payeeMatcher.match(typed, [name]) !== null ||
      (wanted.length > 0 && wanted.every((word) => words.has(word)))
    );
  });
};

const isCounted = (sealed: Record<string, unknown>) => {
  const amount = sealed.amountCents;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) return false;
  const isLinked =
    typeof sealed.incomeDayId === 'string' ||
    typeof sealed.pairedWithId === 'string' ||
    typeof sealed.cardPaymentMoveId === 'string';
  if (isLinked) return false;
  return amount > 0 || (amount < 0 && typeof sealed.refundOfId === 'string');
};

const readLines = (sealed: Record<string, unknown>) =>
  (Array.isArray(sealed.lines) ? sealed.lines : []).flatMap((line) => {
    const one = asObject(line);
    return one === null ? [] : [{ envelopeId: readText(one.envelopeId) }];
  });

const envelopeNames = async (
  firestore: Firestore,
  uid: string,
  planKey: Awaited<ReturnType<typeof unwrapPlanKey>>,
  ids: string[],
) => {
  const snapshots = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / ENVELOPE_CHUNK) }, (_, index) =>
      firestore
        .collection(`apps/runway/plans/${uid}/versions`)
        .where(
          'itemId',
          'in',
          ids.slice(index * ENVELOPE_CHUNK, (index + 1) * ENVELOPE_CHUNK),
        )
        .get(),
    ),
  );
  const newest = snapshots
    .flatMap((snapshot) => snapshot.docs)
    .filter((doc) => doc.get('kind') === 'envelope')
    .sort(
      (a, b) =>
        (b.get('createdAt') as number) - (a.get('createdAt') as number) ||
        b.id.localeCompare(a.id),
    );
  return newest.reduce((names, doc) => {
    const itemId = doc.get('itemId') as string;
    const sealed = doc.get('sealed');
    if (names.has(itemId) || !isSealed(sealed)) return names;
    try {
      const name = readText(openWithKey(planKey.key, sealed).name);
      return name === null ? names : names.set(itemId, name);
    } catch {
      return names;
    }
  }, new Map<string, string>());
};

const readCurrency = async (
  firestore: Firestore,
  uid: string,
  planKey: Awaited<ReturnType<typeof unwrapPlanKey>>,
) => {
  const plan = await firestore.doc(`apps/runway/plans/${uid}`).get();
  const fromSealed = (field: string, key: string) => {
    const sealed = plan.get(field);
    if (!isSealed(sealed)) return null;
    try {
      const code = openWithKey(planKey.key, sealed)[key];
      return typeof code === 'string' && /^[A-Z]{3}$/.test(code) ? code : null;
    } catch {
      return null;
    }
  };
  return (
    fromSealed('sealed', 'currencyCode') ??
    fromSealed('shareSummary', 'currency')
  );
};

/** The person's spending and refunds in a range of days, newest first, each with only its day, payee, amount and category; the total covers every match, not only the rows returned. */
export async function readTransactions(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  args: unknown,
  now: number,
): Promise<TransactionRead> {
  const { from, to } = readRange(args, now);
  const payee = readPayeeFilter(args);
  const empty: TransactionRead = {
    rows: [],
    matchedCount: 0,
    totalCents: 0,
    currency: null,
    isPartial: false,
  };
  if (from > to) return empty;
  const planKey = await unwrapPlanKey(firestore, keyring, uid);
  const snapshot = await firestore
    .collection(`apps/runway/plans/${uid}/purchases`)
    .where('date', '>=', from)
    .where('date', '<=', to)
    .orderBy('date', 'desc')
    .limit(SCAN_LIMIT)
    .get();
  const opened = snapshot.docs.flatMap((doc): Opened[] => {
    const sealed = doc.get('sealed');
    const date = doc.get('date');
    if (!isSealed(sealed) || typeof date !== 'number') return [];
    try {
      const fields = openWithKey(planKey.key, sealed);
      return isCounted(fields) ? [{ id: doc.id, date, sealed: fields }] : [];
    } catch {
      return [];
    }
  });
  const matched = opened.filter(({ sealed }) => {
    if (payee === null) return true;
    const names = [readText(sealed.label), readText(sealed.merchant)].filter(
      (name): name is string => name !== null,
    );
    return isPayeeMatch(payee, names);
  });
  const shown = matched.slice(0, ROW_LIMIT);
  const envelopeIds = [
    ...new Set(
      shown.flatMap(({ sealed }) => {
        const lines = readLines(sealed);
        return lines.length === 1 && lines[0].envelopeId !== null
          ? [lines[0].envelopeId]
          : [];
      }),
    ),
  ];
  const [names, currency] = await Promise.all([
    envelopeIds.length > 0
      ? envelopeNames(firestore, uid, planKey, envelopeIds)
      : Promise.resolve(new Map<string, string>()),
    readCurrency(firestore, uid, planKey),
  ]);
  const toCategory = (sealed: Record<string, unknown>) => {
    if (asObject(sealed.billRef) !== null) return 'Bill';
    const lines = readLines(sealed);
    if (lines.length > 1) return 'Split';
    const [only] = lines;
    if (!only || only.envelopeId === null) return FREE_TO_SPEND;
    return names.get(only.envelopeId) ?? null;
  };
  return {
    rows: shown.map(({ id, date, sealed }) => ({
      id,
      date,
      payee: readPayee(sealed) ?? 'A purchase',
      amountCents: sealed.amountCents as number,
      category: toCategory(sealed),
    })),
    matchedCount: matched.length,
    totalCents: matched.reduce(
      (sum, { sealed }) => sum + (sealed.amountCents as number),
      0,
    ),
    currency,
    isPartial: snapshot.size >= SCAN_LIMIT,
  };
}
