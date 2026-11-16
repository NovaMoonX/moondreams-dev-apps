import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { todayIn } from '../../../connections/liveDay.js';
import { openWithKey, unwrapPlanKey, type Keyring } from '../planKey.js';
import {
  asObject,
  isCounted,
  isSealed,
  readCurrency,
  readDay,
  readLines,
  readText,
} from './transactions.js';

const DAY_MS = 86_400_000;
const SCAN_LIMIT = 500;
const LIST_LIMIT = 200;
const CHUNK = 30;
const ENDED_ROW_ID = '__ended';

export interface LiveArgs {
  text: string | null;
  from: number | null;
  to: number | null;
  zone: string | null;
}

/** The text and days a reader asked for; anything malformed is as if not asked. */
export const readLiveArgs = (args: unknown): LiveArgs => {
  const asked = asObject(args);
  return {
    text: readText(asked?.text)?.toLowerCase() ?? null,
    from: readDay(asked?.from),
    to: readDay(asked?.to),
    zone: typeof asked?.timeZone === 'string' ? asked.timeZone : null,
  };
};

/** The person's today as a UTC-midnight day. */
export const readToday = (zone: string | null, now: number) =>
  Date.parse(`${todayIn(zone, now)}T00:00:00Z`);

export const toDayText = (at: number | null) =>
  at === null ? null : new Date(at).toISOString().slice(0, 10);

const isTextMatch = (text: string | null, name: string) =>
  text === null || name.toLowerCase().includes(text);

const readDocs = async (
  firestore: Firestore,
  path: string,
  fields: string[],
) => {
  const snapshot = await firestore
    .collection(path)
    .select(...fields)
    .limit(LIST_LIMIT + 1)
    .get();
  return {
    docs: snapshot.docs.slice(0, LIST_LIMIT),
    isFull: snapshot.size <= LIST_LIMIT,
  };
};

type PlanKey = Awaited<ReturnType<typeof unwrapPlanKey>>;

const openDoc = (planKey: PlanKey, sealed: unknown) => {
  if (!isSealed(sealed)) return null;
  try {
    return openWithKey(planKey.key, sealed);
  } catch {
    return null;
  }
};

const readDateOnly = (value: unknown) =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value % DAY_MS === 0
    ? value
    : null;

const readCents = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;

export interface EnvelopeSpending {
  id: string;
  name: string;
  spentCents: number;
}

export interface EnvelopeSpendingRead {
  rows: EnvelopeSpending[];
  totalCents: number;
  currency: string | null;
  isPartial: boolean;
  from: number;
  to: number;
}

/** What each envelope spent over the days asked for (this month so far when none), the purchases counted as the transactions list counts them; what is left in an envelope is the plan's engine's figure and is not read. */
export async function readEnvelopeSpending(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  envelopes: { id: string; name: string }[],
  isEnvelopeListFull: boolean,
  args: LiveArgs,
  now: number,
): Promise<EnvelopeSpendingRead> {
  const today = readToday(args.zone, now);
  const monthStart = new Date(today);
  const from =
    args.from ??
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1);
  const to = args.to ?? today;
  const empty = (isPartial: boolean): EnvelopeSpendingRead => ({
    rows: [],
    totalCents: 0,
    currency: null,
    isPartial,
    from,
    to,
  });
  if (from > to) return empty(false);
  const planKey = await unwrapPlanKey(firestore, keyring, uid);
  const snapshot = await firestore
    .collection(`apps/runway/plans/${uid}/purchases`)
    .where('date', '>=', from)
    .where('date', '<=', to)
    .orderBy('date', 'desc')
    .limit(SCAN_LIMIT + 1)
    .get();
  const attempts = snapshot.docs.slice(0, SCAN_LIMIT).map((doc) => {
    const fields = openDoc(planKey, doc.get('sealed'));
    return fields === null
      ? ('unreadable' as const)
      : isCounted(fields, doc.get('needsHome') === true)
        ? fields
        : null;
  });
  const unreadable = attempts.filter(
    (attempt) => attempt === 'unreadable',
  ).length;
  if (unreadable > 0)
    logger.warn('runway.share.envelopeSpendingUnreadable', {
      count: unreadable,
    });
  const spent = attempts.reduce((found, attempt) => {
    if (typeof attempt !== 'object' || attempt === null) return found;
    return readLines(attempt).reduce(
      (inner, { envelopeId, cents }) =>
        envelopeId === null
          ? inner
          : inner.set(envelopeId, (inner.get(envelopeId) ?? 0) + cents),
      found,
    );
  }, new Map<string, number>());
  const currency = await readCurrency(firestore, uid, planKey);
  const listedIds = new Set(envelopes.map(({ id }) => id));
  const endedCents = [...spent].reduce(
    (sum, [id, cents]) => (listedIds.has(id) ? sum : sum + cents),
    0,
  );
  const endedRows =
    args.text === null && endedCents !== 0
      ? [
          {
            id: ENDED_ROW_ID,
            name: 'Envelopes since ended',
            spentCents: endedCents,
          },
        ]
      : [];
  const rows = envelopes
    .filter(({ name }) => isTextMatch(args.text, name))
    .map(({ id, name }) => ({ id, name, spentCents: spent.get(id) ?? 0 }))
    .concat(endedRows)
    .sort(
      (a, b) => b.spentCents - a.spentCents || a.name.localeCompare(b.name),
    );
  return {
    rows,
    totalCents: rows.reduce((sum, row) => sum + row.spentCents, 0),
    currency,
    isPartial:
      !isEnvelopeListFull ||
      snapshot.size > SCAN_LIMIT ||
      unreadable > 0 ||
      (args.text !== null && endedCents !== 0),
    from,
    to,
  };
}

export interface AccountBalance {
  id: string;
  name: string;
  kind: string | null;
  balanceCents: number | null;
  balanceOn: number | null;
  isCounted: boolean;
}

export interface AccountBalancesRead {
  rows: AccountBalance[];
  totalCents: number;
  currency: string | null;
  isPartial: boolean;
}

/** Each open account with its balance: the bank's figure once it is linked and the bank has sent one, else the one the person last gave. */
export async function readAccountBalances(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  args: LiveArgs,
): Promise<AccountBalancesRead> {
  const planKey = await unwrapPlanKey(firestore, keyring, uid);
  const base = `apps/runway/plans/${uid}`;
  const { docs, isFull } = await readDocs(firestore, `${base}/accounts`, [
    'archivedAt',
    'linkId',
    'sealed',
  ]);
  const open = docs.filter((doc) => doc.get('archivedAt') == null);
  const linked = open.filter((doc) => typeof doc.get('linkId') === 'string');
  const bankDocs =
    linked.length === 0
      ? []
      : await firestore.getAll(
          ...linked.map((doc) =>
            firestore.doc(`${base}/accountBalances/${doc.id}`),
          ),
          { fieldMask: ['asOf', 'sealed'] },
        );
  const bank = new Map(
    bankDocs.flatMap((doc) => {
      const fields = doc.exists ? openDoc(planKey, doc.get('sealed')) : null;
      const cents = readCents(fields?.cents);
      const asOf = doc.get('asOf');
      return cents === null || typeof asOf !== 'number'
        ? []
        : [[doc.id, { cents, asOf }] as const];
    }),
  );
  const opened = open.map((doc) => {
    const fields = openDoc(planKey, doc.get('sealed'));
    return { doc, fields, name: readText(fields?.name) };
  });
  const unreadable = opened.filter(({ name }) => name === null).length;
  const accounts = opened.flatMap(({ doc, fields, name }): AccountBalance[] => {
    if (fields === null || name === null || !isTextMatch(args.text, name))
      return [];
    const fromBank = bank.get(doc.id);
    return [
      {
        id: doc.id,
        name,
        kind: readText(fields.kind),
        balanceCents: fromBank?.cents ?? readCents(fields.balanceCents),
        balanceOn:
          fromBank === undefined
            ? readDateOnly(fields.balanceOn)
            : Math.floor(fromBank.asOf / DAY_MS) * DAY_MS,
        isCounted: fields.countedTowardTotal !== false,
      },
    ];
  });
  const currency = await readCurrency(firestore, uid, planKey);
  return {
    rows: accounts.sort((a, b) => a.name.localeCompare(b.name)),
    totalCents: accounts.reduce(
      (sum, account) =>
        account.isCounted ? sum + (account.balanceCents ?? 0) : sum,
      0,
    ),
    currency,
    isPartial: !isFull || unreadable > 0,
  };
}

export interface CardDue {
  id: string;
  name: string;
  dueAt: number | null;
  amountCents: number | null;
  amountKind: 'statement' | 'minimum' | null;
}

export interface CardsDueRead {
  rows: CardDue[];
  totalCents: number;
  currency: string | null;
  isPartial: boolean;
}

const dueInMonth = (day: number, year: number, month: number) =>
  Date.UTC(
    year,
    month,
    Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()),
  );

/** The next day a card is due, today included. */
const nextDueOn = (dueDay: number | null, today: number) => {
  if (dueDay === null) return null;
  const now = new Date(today);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const thisMonth = dueInMonth(dueDay, year, month);
  return thisMonth >= today
    ? thisMonth
    : dueInMonth(dueDay, month === 11 ? year + 1 : year, (month + 1) % 12);
};

const readDueDay = (value: unknown) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 31
    ? value
    : null;

/** Each open card with its next due day (the bank's, while the card is linked to a working sign-in and the bank names one) and, only while the bank's statement is still ahead, what it says is owed. */
export async function readCardsDue(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  args: LiveArgs,
  now: number,
): Promise<CardsDueRead> {
  const today = readToday(args.zone, now);
  const planKey = await unwrapPlanKey(firestore, keyring, uid);
  const base = `apps/runway/plans/${uid}`;
  const { docs, isFull } = await readDocs(firestore, `${base}/cards`, [
    'archivedAt',
    'linkId',
    'sealed',
  ]);
  const open = docs.filter((doc) => doc.get('archivedAt') == null);
  const linkIds = [
    ...new Set(
      open.flatMap((doc) => {
        const linkId = doc.get('linkId');
        return typeof linkId === 'string' ? [linkId] : [];
      }),
    ),
  ];
  const linkSnapshots = await Promise.all(
    Array.from({ length: Math.ceil(linkIds.length / CHUNK) }, (_, index) =>
      firestore.getAll(
        ...linkIds
          .slice(index * CHUNK, (index + 1) * CHUNK)
          .map((id) => firestore.doc(`${base}/links/${id}`)),
        { fieldMask: ['status'] },
      ),
    ),
  );
  const working = new Set(
    linkSnapshots
      .flat()
      .filter((doc) => doc.get('status') === 'active')
      .map((doc) => doc.id),
  );
  const isLinked = (doc: (typeof open)[number]) => {
    const linkId = doc.get('linkId');
    return typeof linkId === 'string' && working.has(linkId);
  };
  const linkedCards = open.filter(isLinked);
  const statementDocs =
    linkedCards.length === 0
      ? []
      : await firestore.getAll(
          ...linkedCards.map((doc) =>
            firestore.doc(`${base}/cardStatements/${doc.id}`),
          ),
          { fieldMask: ['sealed'] },
        );
  const statements = new Map(
    statementDocs.flatMap((doc) => {
      const fields = doc.exists ? openDoc(planKey, doc.get('sealed')) : null;
      return fields === null ? [] : [[doc.id, fields] as const];
    }),
  );
  const cards = open.flatMap((doc): CardDue[] => {
    const fields = openDoc(planKey, doc.get('sealed'));
    const issuer = readText(fields?.issuer);
    if (fields === null || issuer === null) return [];
    const name = [issuer, readText(fields.name)]
      .filter((part) => part !== null)
      .join(' ');
    if (!isTextMatch(args.text, name)) return [];
    const statement = statements.get(doc.id);
    const statementDueOn = readDateOnly(statement?.dueOn);
    const dueAt = nextDueOn(
      statementDueOn === null
        ? readDueDay(fields.dueDay)
        : new Date(statementDueOn).getUTCDate(),
      today,
    );
    const statementCents = readCents(statement?.statementCents);
    const minimumCents = readCents(statement?.minimumCents);
    const isAhead = statementDueOn !== null && statementDueOn >= today;
    const amountCents = !isAhead ? null : (statementCents ?? minimumCents);
    return [
      {
        id: doc.id,
        name,
        dueAt,
        amountCents,
        amountKind:
          amountCents === null
            ? null
            : statementCents === null
              ? 'minimum'
              : 'statement',
      },
    ];
  });
  const inRange = cards.filter(
    ({ dueAt }) =>
      (args.from === null && args.to === null) ||
      (dueAt !== null &&
        (args.from === null || dueAt >= args.from) &&
        (args.to === null || dueAt <= args.to)),
  );
  const currency = await readCurrency(firestore, uid, planKey);
  return {
    rows: inRange.sort(
      (a, b) =>
        (a.dueAt ?? Number.MAX_SAFE_INTEGER) -
          (b.dueAt ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name),
    ),
    totalCents: inRange.reduce((sum, card) => sum + (card.amountCents ?? 0), 0),
    currency,
    isPartial: !isFull,
  };
}
