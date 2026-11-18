import { createHash } from 'node:crypto';

import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { canOpenApp } from '../../../appAccess.js';
import type {
  LiveQueryResult,
  SourceAdapter,
  SourceCtx,
  SyncPageResult,
} from '../../../connections/registry.js';
import {
  EXTRA_KEYS,
  SHARED_RECORD_KEYS,
  type ExtraValue,
  type SharedRecord,
} from '../../../vendor/connectionsContract.js';
import { formatMoney } from '../../../utils/formatMoney.js';
import { loadKeyring, RUNWAY_MASTER_KEYS } from '../getRunwayKey.js';
import {
  openWithKey,
  unwrapPlanKey,
  type Keyring,
  type SealedPayload,
} from '../planKey.js';
import { RUNWAY_SHARES } from './manifest.js';
import {
  readAccountBalances,
  readCardsDue,
  readEnvelopeSpending,
  readLiveArgs,
  readToday,
  toDayText,
} from './balances.js';
import { readTransactions } from './transactions.js';

const readManifest = () => {
  const [declared] = RUNWAY_SHARES.shares;
  if (!declared) throw new Error('Runway declares nothing to share.');
  return declared;
};

const manifest = readManifest();

const LIST_LIMIT = 20;
const BILL_LIMIT = 30;
const NAME_LIMIT = 120;
const DAY_MS = 86_400_000;

const EMPTY_RECORD: SharedRecord = {
  sourceRef: '',
  kind: 'moneySummary',
  title: '',
  subtitle: null,
  detail: null,
  startAt: null,
  endAt: null,
  isAllDay: false,
  dueAt: null,
  timeZone: null,
  placeLabel: null,
  amountCents: null,
  currency: null,
  sourceUpdatedAt: null,
  extra: {},
};

type RecordFields = Pick<SharedRecord, 'sourceRef' | 'kind' | 'title'> &
  Partial<SharedRecord>;

/** The only way a record leaves: exactly the contract's keys and the kind's extra keys, nothing the source added. */
const toRecord = (fields: RecordFields): SharedRecord => {
  const full: SharedRecord = { ...EMPTY_RECORD, ...fields };
  const allowed = EXTRA_KEYS[full.kind];
  return {
    ...(Object.fromEntries(
      SHARED_RECORD_KEYS.map((key) => [key, full[key]]),
    ) as unknown as SharedRecord),
    extra: Object.fromEntries(
      Object.entries(full.extra).filter(([key]) => allowed.includes(key)),
    ) as Record<string, ExtraValue>,
  };
};

interface Summary {
  computedAt: number;
  currency: string;
  freeToSpendCents: number;
  nextIncomeAt: number | null;
  dueBeforeIncomeCents: number;
  bills: {
    name: string;
    amountCents: number;
    dueAt: number;
    repeats: string | null;
    endsAt: number | null;
    endsAfter: number | null;
    paidAt: number | null;
    paysItself: boolean;
  }[];
  horizon: {
    name: string;
    targetCents: number;
    setAsideCents: number;
    targetAt: number | null;
  }[];
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readCents = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;

const readName = (value: unknown) =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim().slice(0, NAME_LIMIT)
    : null;

/** A 'YYYY-MM-DD' day as UTC midnight; null for anything else, a day that does not exist included. */
const readDay = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().startsWith(value)
    ? at
    : null;
};

const readList = <T>(
  value: unknown,
  read: (entry: unknown) => T | null,
  limit = LIST_LIMIT,
) =>
  (Array.isArray(value) ? value : []).slice(0, limit).flatMap((entry) => {
    const one = read(entry);
    return one === null ? [] : [one];
  });

const readBill = (entry: unknown) => {
  const bill = asObject(entry);
  const name = readName(bill?.name);
  const amountCents = readCents(bill?.amountCents);
  const dueAt = readDay(bill?.dueOn);
  const paidAt = readDay(bill?.paidOn);
  const endsAfter = readCents(bill?.endsAfter);
  return name === null || amountCents === null || dueAt === null
    ? null
    : {
        name,
        amountCents,
        dueAt,
        repeats: readName(bill?.repeats)?.slice(0, 40) ?? null,
        endsAt: readDay(bill?.endsOn),
        endsAfter: endsAfter !== null && endsAfter > 0 ? endsAfter : null,
        paidAt,
        paysItself: paidAt === null && bill?.paysItself === true,
      };
};

const readGoal = (entry: unknown) => {
  const goal = asObject(entry);
  const name = readName(goal?.name);
  const targetCents = readCents(goal?.targetCents);
  const setAsideCents = readCents(goal?.setAsideCents);
  return name === null || targetCents === null || setAsideCents === null
    ? null
    : { name, targetCents, setAsideCents, targetAt: readDay(goal?.targetOn) };
};

/** Every field checked by type; null when the totals themselves are malformed, and a malformed list entry is dropped. */
const readSummary = (opened: Record<string, unknown>): Summary | null => {
  const computedAt = opened.computedAt;
  const freeToSpendCents = readCents(opened.freeToSpendCents);
  const dueBeforeIncomeCents = readCents(opened.dueBeforeIncomeCents);
  const { currency } = opened;
  if (
    typeof computedAt !== 'number' ||
    !Number.isSafeInteger(computedAt) ||
    computedAt <= 0 ||
    freeToSpendCents === null ||
    dueBeforeIncomeCents === null ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/.test(currency)
  )
    return null;
  return {
    computedAt,
    currency,
    freeToSpendCents,
    nextIncomeAt: readDay(opened.nextIncomeOn),
    dueBeforeIncomeCents,
    bills: readList(opened.bills, readBill, BILL_LIMIT),
    horizon: readList(opened.horizon, readGoal),
  };
};

const isSealed = (value: unknown): value is SealedPayload => {
  const sealed = asObject(value);
  return (
    sealed !== null &&
    typeof sealed.value === 'string' &&
    typeof sealed.nonce === 'string'
  );
};

type StoredSummary =
  | { kind: 'unknown' }
  | { kind: 'empty' }
  | { kind: 'summary'; summary: Summary };

const UNKNOWN: StoredSummary = { kind: 'unknown' };

const warnUnreadable = (reason: 'key' | 'malformed') =>
  logger.warn('runway.share.summaryUnreadable', { reason });

const openSealed = async (
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  sealed: SealedPayload,
) => {
  try {
    const planKey = await unwrapPlanKey(firestore, keyring, uid);
    return openWithKey(planKey.key, sealed);
  } catch {
    return null;
  }
};

/** The plan's summary opened under its own key. A summary the device cleared on purpose is empty; none yet, or one that will not open, is unknown. */
async function readStoredSummary(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
): Promise<StoredSummary> {
  const [plan] = await firestore.getAll(
    firestore.doc(`apps/runway/plans/${uid}`),
    { fieldMask: ['shareSummary'] },
  );
  const sealed = plan?.get('shareSummary');
  if (sealed === null) return { kind: 'empty' };
  if (sealed === undefined) return UNKNOWN;
  if (!isSealed(sealed)) {
    warnUnreadable('malformed');
    return UNKNOWN;
  }
  const opened = await openSealed(firestore, keyring, uid, sealed);
  if (opened === null) {
    warnUnreadable('key');
    return UNKNOWN;
  }
  const summary = readSummary(opened);
  if (summary === null) {
    warnUnreadable('malformed');
    return UNKNOWN;
  }
  return { kind: 'summary', summary };
}

const formatDay = (at: number) => new Date(at).toISOString().slice(0, 10);

const DAY_WORDS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const readDetail = (summary: Summary) => {
  if (summary.nextIncomeAt === null) return 'No income day is coming up';
  const day = formatDay(summary.nextIncomeAt);
  return summary.dueBeforeIncomeCents > 0
    ? `${formatMoney(summary.dueBeforeIncomeCents, summary.currency)} is due before the next income on ${day}`
    : `Nothing is due before the next income on ${day}`;
};

/** Stable per row: its name and day, and how many rows before it share both, so twins stay distinct. */
const toRef = (prefix: string, keys: string[], index: number) =>
  `${prefix}/${createHash('sha256')
    .update(
      `${keys[index]}\n${keys.slice(0, index).filter((key) => key === keys[index]).length}`,
    )
    .digest('hex')
    .slice(0, 16)}`;

const readGoalDetail = (goal: Summary['horizon'][number], currency: string) =>
  `${formatMoney(goal.setAsideCents, currency)} set aside of ${formatMoney(goal.targetCents, currency)}`;

const readBillDetail = (bill: Summary['bills'][number]) =>
  [
    bill.paidAt !== null
      ? `Paid on ${DAY_WORDS.format(bill.paidAt)} (due ${DAY_WORDS.format(bill.dueAt)})`
      : null,
    bill.repeats,
    bill.endsAt !== null
      ? `ends ${DAY_WORDS.format(bill.endsAt)}`
      : bill.endsAfter !== null
        ? `ends after ${bill.endsAfter} payments`
        : null,
  ]
    .filter((part) => part !== null)
    .join(', ') || null;

const toRecords = (category: string, summary: Summary): SharedRecord[] => {
  const billKeys = summary.bills.map(
    (bill) => `${bill.name}\n${formatDay(bill.dueAt)}`,
  );
  const goalKeys = summary.horizon.map(
    (goal) => `${goal.name}\n${goal.targetAt ?? ''}`,
  );
  switch (category) {
    case 'moneySummary':
      return [
        toRecord({
          sourceRef: 'plan/summary',
          kind: 'moneySummary',
          title: 'Free to Spend',
          detail: readDetail(summary),
          amountCents: summary.freeToSpendCents,
          currency: summary.currency,
          sourceUpdatedAt: summary.computedAt,
          extra: {
            nextIncomeAt: summary.nextIncomeAt,
            dueBeforeIncomeCents: summary.dueBeforeIncomeCents,
          },
        }),
      ];
    case 'upcomingBills':
      return summary.bills.map((bill, index) =>
        toRecord({
          sourceRef: toRef('bills', billKeys, index),
          kind: 'task',
          title: bill.name,
          detail: readBillDetail(bill),
          amountCents: bill.amountCents,
          currency: summary.currency,
          dueAt: bill.paidAt === null ? bill.dueAt : null,
          isAllDay: true,
          sourceUpdatedAt: summary.computedAt,
          extra: {
            isDone: bill.paidAt !== null,
            isAutomatic: bill.paysItself,
          },
        }),
      );
    case 'horizon':
      return summary.horizon.map((goal, index) =>
        toRecord({
          sourceRef: toRef('horizon', goalKeys, index),
          kind: 'project',
          title: goal.name,
          detail: readGoalDetail(goal, summary.currency),
          amountCents: goal.targetCents,
          currency: summary.currency,
          dueAt: goal.targetAt,
          isAllDay: goal.targetAt !== null,
          sourceUpdatedAt: summary.computedAt,
        }),
      );
    default:
      throw new Error('Unknown category.');
  }
};

const ENVELOPE_LIMIT = 100;
// Archived and ended envelopes stay in the collection, so the read is sized apart from what is sent.
const ENVELOPE_READ_LIMIT = 500;
const ENVELOPE_CHUNK = 30;

type StoredEnvelopes =
  | { kind: 'unknown' }
  | {
      kind: 'envelopes';
      envelopes: { id: string; name: string }[];
      isFull: boolean;
    };

const warnEnvelopesUnreadable = (reason: 'key' | 'names', count: number) =>
  logger.warn('runway.share.envelopesUnreadable', { reason, count });

async function readStoredEnvelopes(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  today: number,
): Promise<StoredEnvelopes> {
  const planKey = await unwrapPlanKey(firestore, keyring, uid).catch(
    () => null,
  );
  if (planKey === null) {
    warnEnvelopesUnreadable('key', 1);
    return { kind: 'unknown' };
  }
  const items = await firestore
    .collection(`apps/runway/plans/${uid}/items`)
    .where('kind', '==', 'envelope')
    .limit(ENVELOPE_READ_LIMIT)
    .get();
  const allLive = items.docs.filter((doc) => {
    const endedAt = readDay(doc.get('endedAt'));
    return (
      doc.get('archivedAt') == null && (endedAt === null || endedAt >= today)
    );
  });
  const live = allLive.slice(0, ENVELOPE_LIMIT);
  const snapshots = await Promise.all(
    Array.from(
      { length: Math.ceil(live.length / ENVELOPE_CHUNK) },
      (_, index) =>
        firestore
          .collection(`apps/runway/plans/${uid}/versions`)
          .where(
            'itemId',
            'in',
            live
              .slice(index * ENVELOPE_CHUNK, (index + 1) * ENVELOPE_CHUNK)
              .map((doc) => doc.id),
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
  const names = newest.reduce((found, doc) => {
    const itemId = doc.get('itemId') as string;
    const sealed = doc.get('sealed');
    if (found.has(itemId) || !isSealed(sealed)) return found;
    try {
      const name = readName(openWithKey(planKey.key, sealed).name);
      return name === null ? found : found.set(itemId, name);
    } catch {
      return found;
    }
  }, new Map<string, string>());
  const unnamed = live.filter((doc) => !names.has(doc.id)).length;
  if (unnamed > 0) warnEnvelopesUnreadable('names', unnamed);
  return {
    kind: 'envelopes',
    envelopes: live
      .flatMap((doc) => {
        const name = names.get(doc.id);
        return name === undefined ? [] : [{ id: doc.id, name }];
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    isFull:
      unnamed === 0 &&
      items.size < ENVELOPE_READ_LIMIT &&
      allLive.length <= ENVELOPE_LIMIT,
  };
}

const toHashedRef = (prefix: string, id: string) =>
  `${prefix}/${createHash('sha256').update(id).digest('hex').slice(0, 16)}`;

const toKindLabel = (kind: string) =>
  `${kind.slice(0, 1).toUpperCase()}${kind.slice(1).replace(/[_-]/g, ' ')}`;

/** An amount leaves only with its currency. */
const toAmount = (cents: number | null, currency: string | null) =>
  cents === null || currency === null
    ? { amountCents: null, currency: null }
    : { amountCents: cents, currency };

const toTotal = (cents: number, currency: string | null) => ({
  totalCents: currency === null ? null : cents,
  currency,
});

const toTransactionRef = (id: string) =>
  `purchases/${createHash('sha256').update(id).digest('hex').slice(0, 16)}`;

export interface RunwayAdapterDeps {
  firestore: () => Firestore;
  canOpen: (uid: string) => Promise<boolean>;
  keyring: () => Keyring;
  now: () => number;
}

const defaultDeps: RunwayAdapterDeps = {
  firestore: () => getFirestore(),
  keyring: () => loadKeyring(),
  now: () => Date.now(),
  canOpen: async (uid) => {
    const user = await getAuth().getUser(uid);
    return canOpenApp(getFirestore(), 'runway', {
      uid,
      token: {
        email: user.email,
        admin: user.customClaims?.admin,
        dev: user.customClaims?.dev,
      },
    });
  },
};

async function queryEnvelopeSpending(
  deps: RunwayAdapterDeps,
  uid: string,
  rawArgs: unknown,
): Promise<LiveQueryResult> {
  const firestore = deps.firestore();
  const now = deps.now();
  const args = readLiveArgs(rawArgs);
  const stored = await readStoredEnvelopes(
    firestore,
    deps.keyring(),
    uid,
    readToday(args.zone, now),
  );
  const read = await readEnvelopeSpending(
    firestore,
    deps.keyring(),
    uid,
    stored.kind === 'envelopes' ? stored.envelopes : [],
    stored.kind === 'envelopes' && stored.isFull,
    args,
    now,
  );
  return {
    records: read.rows.map((row) =>
      toRecord({
        sourceRef: toHashedRef('envelopes', row.id),
        kind: 'artifact',
        title: row.name,
        detail: `Spent ${DAY_WORDS.format(read.from)} to ${DAY_WORDS.format(read.to)}`,
        startAt: read.from,
        endAt: read.to,
        isAllDay: true,
        ...toAmount(row.spentCents, read.currency),
      }),
    ),
    matchedCount: read.rows.length,
    ...toTotal(read.totalCents, read.currency),
    isPartial: read.isPartial,
    from: toDayText(read.from),
    to: toDayText(read.to),
  };
}

export function createRunwayAdapter(
  deps: RunwayAdapterDeps = defaultDeps,
): SourceAdapter {
  return {
    manifest,
    secrets: [RUNWAY_MASTER_KEYS],
    status: async (ctx: SourceCtx) =>
      (await deps.canOpen(ctx.uid)) ? 'ok' : 'noAccess',
    syncPage: async (ctx, req): Promise<SyncPageResult> => {
      if (!manifest.categories.some(({ id }) => id === req.category))
        throw new Error('Unknown category.');
      if (req.category === 'envelopes') {
        const envelopes = await readStoredEnvelopes(
          deps.firestore(),
          deps.keyring(),
          ctx.uid,
          Math.floor(deps.now() / DAY_MS) * DAY_MS,
        );
        return {
          records:
            envelopes.kind === 'envelopes'
              ? envelopes.envelopes.map(({ id, name }) =>
                  toRecord({
                    sourceRef: `envelopes/${createHash('sha256').update(id).digest('hex').slice(0, 16)}`,
                    kind: 'artifact',
                    title: name,
                    detail: 'An envelope in the plan',
                  }),
                )
              : [],
          isFull: envelopes.kind === 'envelopes' && envelopes.isFull,
          deletedRefs: [],
          cursor: null,
          isDone: true,
          resumeState: null,
        };
      }
      const stored = await readStoredSummary(
        deps.firestore(),
        deps.keyring(),
        ctx.uid,
      );
      // Cleared on purpose is a full, empty read; none yet or unreadable is unknown, so older copies stay.
      return {
        records:
          stored.kind === 'summary'
            ? toRecords(req.category, stored.summary)
            : [],
        isFull: stored.kind !== 'unknown',
        deletedRefs: [],
        cursor: null,
        isDone: true,
        resumeState: null,
      };
    },
    query: async (ctx, req): Promise<LiveQueryResult> => {
      if (req.category === 'envelopeBalances')
        return queryEnvelopeSpending(deps, ctx.uid, req.args);
      if (req.category === 'accountBalances') {
        const read = await readAccountBalances(
          deps.firestore(),
          deps.keyring(),
          ctx.uid,
          readLiveArgs(req.args),
        );
        return {
          records: read.rows.map((row) =>
            toRecord({
              sourceRef: toHashedRef('accounts', row.id),
              kind: 'artifact',
              title: row.name,
              subtitle: row.kind === null ? null : toKindLabel(row.kind),
              detail:
                row.balanceOn === null
                  ? null
                  : `Balance as of ${DAY_WORDS.format(row.balanceOn)}`,
              ...toAmount(row.balanceCents, read.currency),
            }),
          ),
          matchedCount: read.rows.length,
          ...toTotal(read.totalCents, read.currency),
          isPartial: read.isPartial,
          from: null,
          to: null,
        };
      }
      if (req.category === 'cardsDue') {
        const read = await readCardsDue(
          deps.firestore(),
          deps.keyring(),
          ctx.uid,
          readLiveArgs(req.args),
          deps.now(),
        );
        return {
          records: read.rows.map((row) =>
            toRecord({
              sourceRef: toHashedRef('cards', row.id),
              kind: 'task',
              title: row.name,
              subtitle:
                row.amountKind === null
                  ? null
                  : row.amountKind === 'statement'
                    ? 'Statement balance'
                    : 'Minimum payment',
              detail:
                row.dueAt === null
                  ? 'No due day is set'
                  : `Due ${DAY_WORDS.format(row.dueAt)}`,
              dueAt: row.dueAt,
              isAllDay: row.dueAt !== null,
              ...toAmount(row.amountCents, read.currency),
            }),
          ),
          matchedCount: read.rows.length,
          ...toTotal(read.totalCents, read.currency),
          isPartial: read.isPartial,
          from: null,
          to: null,
        };
      }
      if (req.category !== 'transactions') throw new Error('Unknown category.');
      const read = await readTransactions(
        deps.firestore(),
        deps.keyring(),
        ctx.uid,
        req.args,
        deps.now(),
      );
      return {
        records: read.rows.map((row) =>
          toRecord({
            sourceRef: toTransactionRef(row.id),
            kind: 'transaction',
            title: row.payee,
            startAt: row.date,
            isAllDay: true,
            amountCents: row.amountCents,
            currency: read.currency,
            extra: { category: row.category },
          }),
        ),
        matchedCount: read.matchedCount,
        totalCents: read.totalCents,
        currency: read.currency,
        isPartial: read.isPartial,
        from: read.from,
        to: read.to,
      };
    },
    deepLink: () => '/runway',
  };
}
