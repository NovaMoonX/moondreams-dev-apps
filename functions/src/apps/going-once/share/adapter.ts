import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { canOpenApp } from '../../../appAccess.js';
import type {
  LiveQueryRequest,
  LiveQueryResult,
  SourceAdapter,
  SourceCtx,
  SyncPageRequest,
  SyncPageResult,
} from '../../../connections/registry.js';
import {
  MAX_RECORDS_PER_CATEGORY,
  SHARED_RECORD_KEYS,
  type SharedRecord,
} from '../../../vendor/connectionsContract.js';
import { dayRangeMs } from '../../../connections/liveDay.js';
import { isListable, toOpenPickupDays } from '../salePageView.js';
import { GOING_ONCE_SHARES } from './manifest.js';

const readManifest = () => {
  const [declared] = GOING_ONCE_SHARES.shares;
  if (!declared) throw new Error('Going Once declares nothing to share.');
  return declared;
};

const manifest = readManifest();

const DAY_MS = 86_400_000;
const SALE_LIMIT = 100;
const ITEM_LIMIT = 500;

const EMPTY_RECORD: SharedRecord = {
  sourceRef: '',
  kind: 'event',
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

/** The only way a record leaves: exactly the contract's keys, nothing the source added. */
const toRecord = (fields: RecordFields): SharedRecord => {
  const full: SharedRecord = { ...EMPTY_RECORD, ...fields };
  return Object.fromEntries(
    SHARED_RECORD_KEYS.map((key) => [key, full[key]]),
  ) as unknown as SharedRecord;
};

const readText = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const readTime = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

interface CategoryRead {
  records: SharedRecord[];
  isFull: boolean;
}

interface ReadItem {
  id: string;
  title: string | null;
  status: string | null;
  isListable: boolean;
  pickupOn: number | null;
  askingPriceCents: number | null;
  soldCents: number | null;
}

interface ReadSale {
  id: string;
  name: string;
  pickupArea: string | null;
  buyerNote: string | null;
  paymentMethods: string[];
  pickupDays: number[];
  currency: string | null;
  newInquiries: number | null;
  updatedAt: number | null;
  items: ReadItem[];
  isItemsFull: boolean;
}

const readItem = (doc: FirebaseFirestore.QueryDocumentSnapshot): ReadItem[] => {
  if (doc.get('isDraft') === true) return [];
  const status = readText(doc.get('status'));
  if (status === 'WITHDRAWN') return [];
  return [
    {
      id: doc.id,
      title: readText(doc.get('title')),
      status,
      isListable: isListable(doc.data()),
      pickupOn: readTime(doc.get('pending.pickupOn')),
      askingPriceCents: readTime(doc.get('askingPriceCents')),
      soldCents: readTime(doc.get('sale.priceCents')),
    },
  ];
};

const readPaymentMethods = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((method) => {
        const text = readText(method);
        return text === null ? [] : [text];
      })
    : [];

/** Selects only the fields the figures need, so a private one is never fetched, and only counts inquiries by status. */
async function readOpenSales(
  firestore: Firestore,
  uid: string,
  isCountingInquiries = false,
): Promise<{ sales: ReadSale[]; isSalesFull: boolean }> {
  const snapshot = await firestore
    .collection('apps/going-once/sales')
    .where('members', 'array-contains', uid)
    .where('status', '==', 'OPEN')
    .limit(SALE_LIMIT)
    .get();
  const sales = await Promise.all(
    snapshot.docs.flatMap((doc) => {
      const name = readText(doc.get('name'));
      if (name === null) return [];
      return [
        doc.ref
          .collection('items')
          .select(
            'title',
            'status',
            'isDraft',
            'pending.pickupOn',
            'askingPriceCents',
            'sale.priceCents',
            'photos',
          )
          .limit(ITEM_LIMIT)
          .get()
          .then(async (items): Promise<ReadSale> => ({
            id: doc.id,
            name,
            pickupArea: readText(doc.get('pickupArea')),
            buyerNote: readText(doc.get('buyerNote')),
            paymentMethods: readPaymentMethods(doc.get('paymentMethods')),
            pickupDays: toOpenPickupDays(
              {
                pickupDays: doc.get('pickupDays'),
                timeZone: doc.get('timeZone'),
              },
              Date.now(),
            ),
            currency: readText(doc.get('currency')),
            newInquiries: isCountingInquiries
              ? await doc.ref
                  .collection('inquiries')
                  .where('status', '==', 'NEW')
                  .count()
                  .get()
                  .then((counted) => counted.data().count)
                  .catch((error: unknown) => {
                    logger.warn('going-once.share.inquiryCountFailed', {
                      reason:
                        error instanceof Error ? error.message : 'unknown',
                    });
                    return null;
                  })
              : null,
            updatedAt: readTime(doc.get('lastEditedAt')),
            items: items.docs.flatMap(readItem),
            isItemsFull: items.size < ITEM_LIMIT,
          })),
      ];
    }),
  );
  return { sales, isSalesFull: snapshot.size < SALE_LIMIT };
}

const countStatus = (items: ReadItem[], status: string) =>
  items.filter((item) => item.status === status).length;

const sumCents = (items: ReadItem[], pick: (item: ReadItem) => number | null) =>
  items.reduce((total, item) => total + (pick(item) ?? 0), 0);

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});

/** Consecutive days grouped into runs: "Nov 28–30, Dec 2", "Nov 30–Dec 2" across months. */
const toPickupLine = (days: number[]) => {
  const runs = days.reduce<number[][]>(
    (grouped, day) =>
      grouped.length > 0 && day - grouped[grouped.length - 1].at(-1)! === DAY_MS
        ? [...grouped.slice(0, -1), [...grouped[grouped.length - 1], day]]
        : [...grouped, [day]],
    [],
  );
  const text = runs.map((run) => {
    const first = new Date(run[0]);
    const last = new Date(run[run.length - 1]);
    if (run.length === 1) return SHORT_DATE.format(first);
    const end =
      first.getUTCMonth() === last.getUTCMonth()
        ? String(last.getUTCDate())
        : SHORT_DATE.format(last);
    return `${SHORT_DATE.format(first)}–${end}`;
  });
  return text.length > 0 ? `Pickups ${text.join(', ')}` : null;
};

const toSaleDetail = (sale: ReadSale) => {
  const pay =
    sale.paymentMethods.length > 0
      ? `Pay by ${sale.paymentMethods.join(', ')}`
      : null;
  const parts = [sale.buyerNote, pay, toPickupLine(sale.pickupDays)].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
};

async function syncSales(
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> {
  const { sales, isSalesFull } = await readOpenSales(firestore, uid, true);
  return {
    records: sales.map((sale) =>
      toRecord({
        sourceRef: `sales/${sale.id}`,
        kind: 'project',
        title: sale.name,
        detail: toSaleDetail(sale),
        placeLabel: sale.pickupArea,
        currency: sale.currency,
        sourceUpdatedAt: sale.updatedAt,
        extra: {
          available: sale.items.filter(
            (item) => item.status === 'AVAILABLE' && item.isListable,
          ).length,
          pending: countStatus(sale.items, 'PENDING'),
          sold: countStatus(sale.items, 'SOLD'),
          newInquiries: sale.newInquiries,
          collectedCents:
            sale.currency === null
              ? null
              : sumCents(
                  sale.items.filter((item) => item.status === 'SOLD'),
                  (item) => item.soldCents,
                ),
          leftCents:
            sale.currency === null
              ? null
              : sumCents(
                  sale.items.filter(
                    (item) =>
                      item.status === 'PENDING' ||
                      (item.status === 'AVAILABLE' && item.isListable),
                  ),
                  (item) => item.askingPriceCents,
                ),
        },
      }),
    ),
    isFull: isSalesFull && sales.every((sale) => sale.isItemsFull),
  };
}

async function syncThings(
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> {
  const { sales, isSalesFull } = await readOpenSales(firestore, uid);
  return {
    records: sales.flatMap((sale) =>
      sale.items.flatMap((item) => {
        const isPending = item.status === 'PENDING';
        if (
          item.title === null ||
          !(isPending || (item.status === 'AVAILABLE' && item.isListable))
        )
          return [];
        return [
          toRecord({
            sourceRef: `sales/${sale.id}/items/${item.id}`,
            kind: 'artifact',
            title: item.title,
            subtitle: sale.name,
            amountCents: sale.currency === null ? null : item.askingPriceCents,
            currency: sale.currency,
            sourceUpdatedAt: sale.updatedAt,
            extra: { status: isPending ? 'pending' : 'available' },
          }),
        ];
      }),
    ),
    isFull: isSalesFull && sales.every((sale) => sale.isItemsFull),
  };
}

async function syncPickups(
  firestore: Firestore,
  uid: string,
  windowStart: number,
): Promise<CategoryRead> {
  const { sales, isSalesFull } = await readOpenSales(firestore, uid);
  return {
    records: sales.flatMap((sale) =>
      sale.items.flatMap((item) => {
        if (
          item.status !== 'PENDING' ||
          item.title === null ||
          item.pickupOn === null ||
          item.pickupOn < windowStart - DAY_MS
        )
          return [];
        return [
          toRecord({
            sourceRef: `sales/${sale.id}/items/${item.id}`,
            kind: 'event',
            title: item.title,
            subtitle: sale.name,
            startAt: item.pickupOn,
            isAllDay: true,
            sourceUpdatedAt: sale.updatedAt,
          }),
        ];
      }),
    ),
    isFull: isSalesFull && sales.every((sale) => sale.isItemsFull),
  };
}

const CONDITION_LABELS: Record<string, string> = {
  NEW: 'New',
  LIKE_NEW: 'Like new',
  GOOD: 'Good',
  FAIR: 'Fair',
  WELL_USED: 'Well used',
};

const DETAIL_LIMIT = 120;
const NAME_LIMIT = 30;

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > DETAIL_LIMIT
    ? `${flat.slice(0, DETAIL_LIMIT - 1).trimEnd()}…`
    : flat;
};

const LINK_RE =
  /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|app|me|ly|us)\b/i;
const EMAIL_RE = /\S+@\S+|@\w{2,}/;
const PHONE_RE = /\+\s?\d|\(\d{3}\)|\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/;

/** A buyer's own words, dropped whole when they carry a link, an email or a phone number. */
const screenMessage = (message: string | null) =>
  message === null ||
  LINK_RE.test(message) ||
  EMAIL_RE.test(message) ||
  PHONE_RE.test(message) ||
  (message.match(/\d/g)?.length ?? 0) >= 7
    ? null
    : clip(message);

const readFirstName = (name: string | null) => {
  const first = name?.split(/\s+/)[0] ?? '';
  return first === '' || /[@\d]/.test(first)
    ? null
    : first.slice(0, NAME_LIMIT);
};

const readDay = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(at) ? null : at;
};

const toDayText = (at: number | null) =>
  at === null ? null : new Date(at).toISOString().slice(0, 10);

/** The args every live category accepts; one this category has no use for is ignored. */
const readQueryArgs = (args: unknown) => {
  const asked =
    typeof args === 'object' && args !== null
      ? (args as Record<string, unknown>)
      : {};
  const from = readDay(asked.from);
  const to = readDay(asked.to);
  return {
    text: readText(asked.text)?.toLowerCase() ?? null,
    from,
    to,
    ...dayRangeMs(
      toDayText(from),
      toDayText(to),
      typeof asked.timeZone === 'string' ? asked.timeZone : null,
    ),
  };
};

type QueryArgs = ReturnType<typeof readQueryArgs>;

const isInRange = (at: number | null, { fromMs, toMsExclusive }: QueryArgs) =>
  (fromMs === null && toMsExclusive === null) ||
  (at !== null &&
    (fromMs === null || at >= fromMs) &&
    (toMsExclusive === null || at < toMsExclusive));

const isTextMatch = (text: string | null, ...names: (string | null)[]) =>
  text === null ||
  names.some((name) => name?.toLowerCase().includes(text) === true);

interface QueryRows {
  matched: SharedRecord[];
  isFull: boolean;
}

const toQueryResult = (rows: QueryRows, args: QueryArgs): LiveQueryResult => {
  const sorted = [...rows.matched].sort(
    (a, b) =>
      (b.startAt ?? -Infinity) - (a.startAt ?? -Infinity) ||
      a.title.localeCompare(b.title),
  );
  return {
    records: sorted.slice(0, MAX_RECORDS_PER_CATEGORY),
    matchedCount: sorted.length,
    totalCents: null,
    currency: null,
    isPartial: !rows.isFull || sorted.length > MAX_RECORDS_PER_CATEGORY,
    from: toDayText(args.from),
    to: toDayText(args.to),
  };
};

interface QuerySale {
  id: string;
  name: string;
  currency: string | null;
}

/** Every sale the person sells in, finished ones included, each read for its own rows. */
async function readSaleRows(
  firestore: Firestore,
  uid: string,
  readRows: (
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    sale: QuerySale,
  ) => Promise<QueryRows>,
): Promise<QueryRows> {
  const snapshot = await firestore
    .collection('apps/going-once/sales')
    .where('members', 'array-contains', uid)
    .limit(SALE_LIMIT)
    .get();
  const reads = await Promise.all(
    snapshot.docs.flatMap((doc) => {
      const name = readText(doc.get('name'));
      return name === null
        ? []
        : [
            readRows(doc, {
              id: doc.id,
              name,
              currency: readText(doc.get('currency')),
            }),
          ];
    }),
  );
  return {
    matched: reads.flatMap((read) => read.matched),
    isFull: snapshot.size < SALE_LIMIT && reads.every((read) => read.isFull),
  };
}

const readLastStatusAt = (history: unknown) => {
  const last = Array.isArray(history) ? history[history.length - 1] : null;
  return typeof last === 'object' && last !== null
    ? readTime((last as Record<string, unknown>).at)
    : null;
};

const toThingState = (
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  status: string | null,
) => {
  if (doc.get('isDraft') === true) return 'draft';
  if (status === 'AVAILABLE' && !isListable(doc.data())) return 'notReady';
  return (status ?? 'unknown').toLowerCase();
};

const queryAllThings = (firestore: Firestore, uid: string, args: QueryArgs) =>
  readSaleRows(firestore, uid, async (doc, sale) => {
    const items = await doc.ref
      .collection('items')
      .select(
        'title',
        'status',
        'isDraft',
        'condition',
        'askingPriceCents',
        'floorPriceCents',
        'notes',
        'statusHistory',
        'photos',
        'lastEditedAt',
      )
      .limit(ITEM_LIMIT)
      .get();
    return {
      isFull: items.size < ITEM_LIMIT,
      matched: items.docs.flatMap((item) => {
        const title = readText(item.get('title'));
        const changedAt =
          readLastStatusAt(item.get('statusHistory')) ??
          readTime(item.get('lastEditedAt'));
        if (
          !isTextMatch(args.text, title, sale.name) ||
          !isInRange(changedAt, args)
        )
          return [];
        const condition = readText(item.get('condition'));
        const conditionLabel =
          condition === null ? null : (CONDITION_LABELS[condition] ?? null);
        const notes = readText(item.get('notes'));
        const detail = [conditionLabel, notes]
          .filter((part): part is string => part !== null)
          .join(' · ');
        const price = (field: string) =>
          sale.currency === null ? null : readTime(item.get(field));
        return [
          toRecord({
            sourceRef: `sales/${sale.id}/items/${item.id}`,
            kind: 'artifact',
            title: title ?? 'Untitled thing',
            subtitle: sale.name,
            detail: detail === '' ? null : clip(detail),
            startAt: changedAt,
            amountCents: price('askingPriceCents'),
            currency: sale.currency,
            sourceUpdatedAt: readTime(item.get('lastEditedAt')),
            extra: {
              state: toThingState(item, readText(item.get('status'))),
              condition: conditionLabel,
              floorPriceCents: price('floorPriceCents'),
            },
          }),
        ];
      }),
    };
  });

const queryQuestions = (firestore: Firestore, uid: string, args: QueryArgs) =>
  readSaleRows(firestore, uid, async (doc, sale) => {
    const inquiries = await doc.ref
      .collection('inquiries')
      .select('itemTitleAtSend', 'name', 'message', 'status', 'createdAt')
      .limit(ITEM_LIMIT)
      .get();
    return {
      isFull: inquiries.size < ITEM_LIMIT,
      matched: inquiries.docs.flatMap((inquiry) => {
        const title = readText(inquiry.get('itemTitleAtSend'));
        const status = readText(inquiry.get('status'));
        const createdAt = readTime(inquiry.get('createdAt'));
        if (
          (status !== 'NEW' && status !== 'HANDLED') ||
          !isTextMatch(args.text, title, sale.name) ||
          !isInRange(createdAt, args)
        )
          return [];
        return [
          toRecord({
            sourceRef: `sales/${sale.id}/inquiries/${inquiry.id}`,
            kind: 'event',
            title: title ?? 'A thing',
            subtitle: sale.name,
            detail: screenMessage(readText(inquiry.get('message'))),
            startAt: createdAt,
            sourceUpdatedAt: createdAt,
            extra: {
              buyerFirstName: readFirstName(readText(inquiry.get('name'))),
              status: status === 'NEW' ? 'new' : 'handled',
            },
          }),
        ];
      }),
    };
  });

/** Buyers who asked about a thing (first names, one per name per sale) and the other people selling in the person's sales (first names). */
const syncPeople = async (
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> => {
  const snapshot = await firestore
    .collection('apps/going-once/sales')
    .where('members', 'array-contains', uid)
    .limit(SALE_LIMIT)
    .get();
  const sales = snapshot.docs.flatMap((doc) => {
    const name = readText(doc.get('name'));
    return name === null
      ? []
      : [
          {
            id: doc.id,
            name,
            ref: doc.ref,
            members: (Array.isArray(doc.get('members'))
              ? (doc.get('members') as unknown[])
              : []
            ).filter(
              (member): member is string =>
                typeof member === 'string' && member !== uid,
            ),
          },
        ];
  });
  const buyerReads = await Promise.all(
    sales.map((sale) =>
      sale.ref
        .collection('inquiries')
        .select('name', 'status')
        .limit(ITEM_LIMIT)
        .get(),
    ),
  );
  const buyers = sales.flatMap((sale, index) => {
    const names = new Map<string, string>();
    (buyerReads[index]?.docs ?? []).forEach((inquiry) => {
      const status = readText(inquiry.get('status'));
      const first = readFirstName(readText(inquiry.get('name')));
      if ((status === 'NEW' || status === 'HANDLED') && first !== null)
        names.set(first.toLowerCase(), first);
    });
    return Array.from(names, ([key, first]) =>
      toRecord({
        sourceRef: `sales/${sale.id}/buyers/${key}`,
        kind: 'person',
        title: first,
        detail: clip(`Asked about things in ${sale.name}`),
        subtitle: 'Buyer',
      }),
    );
  });
  const sellerIds = Array.from(new Set(sales.flatMap((sale) => sale.members)));
  const profiles =
    sellerIds.length === 0
      ? []
      : await firestore
          .getAll(...sellerIds.map((id) => firestore.doc(`users/${id}`)), {
            fieldMask: ['displayName'],
          })
          .catch(() => null);
  if (profiles === null)
    return {
      records: buyers.slice(0, MAX_RECORDS_PER_CATEGORY),
      isFull: false,
    };
  const firstNames = new Map(
    profiles.map((profile) => [
      profile.id,
      readFirstName(readText(profile.get('displayName'))),
    ]),
  );
  const sellers = sellerIds.flatMap((id) => {
    const first = firstNames.get(id) ?? null;
    const shared = sales
      .filter((sale) => sale.members.includes(id))
      .map((sale) => sale.name);
    return first === null
      ? []
      : [
          toRecord({
            sourceRef: `users/${id}`,
            kind: 'person',
            title: first,
            detail: clip(`Sells with you: ${shared.slice(0, 3).join(', ')}`),
            subtitle: 'Co-seller',
          }),
        ];
  });
  const records = [...sellers, ...buyers];
  return {
    records: records.slice(0, MAX_RECORDS_PER_CATEGORY),
    isFull:
      snapshot.size < SALE_LIMIT &&
      records.length <= MAX_RECORDS_PER_CATEGORY &&
      buyerReads.every((read) => read.size < ITEM_LIMIT),
  };
};

export interface GoingOnceAdapterDeps {
  firestore: () => Firestore;
  canOpen: (uid: string) => Promise<boolean>;
}

const defaultDeps: GoingOnceAdapterDeps = {
  firestore: () => getFirestore(),
  canOpen: async (uid) => {
    const user = await getAuth().getUser(uid);
    return canOpenApp(getFirestore(), 'going-once', {
      uid,
      token: {
        email: user.email,
        admin: user.customClaims?.admin,
        dev: user.customClaims?.dev,
      },
    });
  },
};

export function createGoingOnceAdapter(
  deps: GoingOnceAdapterDeps = defaultDeps,
): SourceAdapter {
  const readCategory = (uid: string, req: SyncPageRequest) => {
    const firestore = deps.firestore();
    switch (req.category) {
      case 'pickups':
        return syncPickups(firestore, uid, req.windowStart);
      case 'sales':
        return syncSales(firestore, uid);
      case 'things':
        return syncThings(firestore, uid);
      case 'people':
        return syncPeople(firestore, uid);
      default:
        throw new Error('Unknown category.');
    }
  };

  return {
    manifest,
    status: async (ctx: SourceCtx) =>
      (await deps.canOpen(ctx.uid)) ? 'ok' : 'noAccess',
    syncPage: async (ctx, req): Promise<SyncPageResult> => ({
      ...(await readCategory(ctx.uid, req)),
      deletedRefs: [],
      cursor: null,
      isDone: true,
      resumeState: null,
    }),
    query: async (ctx, req: LiveQueryRequest): Promise<LiveQueryResult> => {
      const firestore = deps.firestore();
      const args = readQueryArgs(req.args);
      switch (req.category) {
        case 'allThings':
          return toQueryResult(
            await queryAllThings(firestore, ctx.uid, args),
            args,
          );
        case 'questions':
          return toQueryResult(
            await queryQuestions(firestore, ctx.uid, args),
            args,
          );
        default:
          throw new Error('Unknown category.');
      }
    },
    deepLink: () => '/going-once',
  };
}
