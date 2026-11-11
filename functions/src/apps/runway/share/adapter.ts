import { createHash } from 'node:crypto';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { canOpenApp } from '../../../appAccess.js';
import type {
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
import { loadKeyring, RUNWAY_MASTER_KEYS } from '../getRunwayKey.js';
import {
  openWithKey,
  unwrapPlanKey,
  type Keyring,
  type SealedPayload,
} from '../planKey.js';
import { RUNWAY_SHARES } from './manifest.js';

const readManifest = () => {
  const [declared] = RUNWAY_SHARES.shares;
  if (!declared) throw new Error('Runway declares nothing to share.');
  return declared;
};

const manifest = readManifest();

const LIST_LIMIT = 20;
const NAME_LIMIT = 120;

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
  bills: { name: string; amountCents: number; dueAt: number }[];
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

const readList = <T>(value: unknown, read: (entry: unknown) => T | null) =>
  (Array.isArray(value) ? value : []).slice(0, LIST_LIMIT).flatMap((entry) => {
    const one = read(entry);
    return one === null ? [] : [one];
  });

const readBill = (entry: unknown) => {
  const bill = asObject(entry);
  const name = readName(bill?.name);
  const amountCents = readCents(bill?.amountCents);
  const dueAt = readDay(bill?.dueOn);
  return name === null || amountCents === null || dueAt === null
    ? null
    : { name, amountCents, dueAt };
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
    !Number.isFinite(computedAt) ||
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
    bills: readList(opened.bills, readBill),
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

/** The plan's summary opened under its own key; null when there is none yet or the key or payload will not open. */
async function readStoredSummary(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
) {
  const [plan] = await firestore.getAll(
    firestore.doc(`apps/runway/plans/${uid}`),
    { fieldMask: ['shareSummary'] },
  );
  const sealed = plan?.get('shareSummary');
  if (!isSealed(sealed)) return null;
  try {
    const planKey = await unwrapPlanKey(firestore, keyring, uid);
    return readSummary(openWithKey(planKey.key, sealed));
  } catch {
    return null;
  }
}

const formatAmount = (cents: number, currency: string) =>
  `${(cents / 100).toFixed(2)} ${currency}`;

const formatDay = (at: number) => new Date(at).toISOString().slice(0, 10);

const readDetail = (summary: Summary) => {
  if (summary.nextIncomeAt === null) return 'No income day is coming up';
  const day = formatDay(summary.nextIncomeAt);
  return summary.dueBeforeIncomeCents > 0
    ? `${formatAmount(summary.dueBeforeIncomeCents, summary.currency)} is due before the next income on ${day}`
    : `Nothing is due before the next income on ${day}`;
};

const toBillRef = (name: string, dueAt: number) =>
  `bills/${createHash('sha256')
    .update(`${name}\n${formatDay(dueAt)}`)
    .digest('hex')
    .slice(0, 16)}`;

const toRecords = (category: string, summary: Summary): SharedRecord[] => {
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
      return summary.bills.map((bill) =>
        toRecord({
          sourceRef: toBillRef(bill.name, bill.dueAt),
          kind: 'task',
          title: bill.name,
          amountCents: bill.amountCents,
          currency: summary.currency,
          dueAt: bill.dueAt,
          isAllDay: true,
          sourceUpdatedAt: summary.computedAt,
        }),
      );
    case 'horizon':
      return summary.horizon.map((goal) =>
        toRecord({
          sourceRef: `horizon/${createHash('sha256')
            .update(`${goal.name}\n${goal.targetAt ?? ''}`)
            .digest('hex')
            .slice(0, 16)}`,
          kind: 'project',
          title: goal.name,
          detail: `${formatAmount(goal.setAsideCents, summary.currency)} set aside of ${formatAmount(goal.targetCents, summary.currency)}`,
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

export interface RunwayAdapterDeps {
  firestore: () => Firestore;
  canOpen: (uid: string) => Promise<boolean>;
  keyring: () => Keyring;
}

const defaultDeps: RunwayAdapterDeps = {
  firestore: () => getFirestore(),
  keyring: () => loadKeyring(),
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
      const summary = await readStoredSummary(
        deps.firestore(),
        deps.keyring(),
        ctx.uid,
      );
      // No summary yet, or one that will not open, is unknown rather than empty, so older copies stay.
      return {
        records: summary === null ? [] : toRecords(req.category, summary),
        isFull: summary !== null,
        deletedRefs: [],
        cursor: null,
        isDone: true,
        resumeState: null,
      };
    },
    deepLink: () => '/runway',
  };
}
