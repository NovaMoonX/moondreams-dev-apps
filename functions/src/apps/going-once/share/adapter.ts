import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { canOpenApp } from '../../../appAccess.js';
import type {
  SourceAdapter,
  SourceCtx,
  SyncPageRequest,
  SyncPageResult,
} from '../../../connections/registry.js';
import {
  SHARED_RECORD_KEYS,
  type SharedRecord,
} from '../../../vendor/connectionsContract.js';
import { isListable } from '../salePageView.js';
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
}

interface ReadSale {
  id: string;
  name: string;
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
    },
  ];
};

/** Items are read with only the fields the counts need, so a private one is never fetched; an available thing counts once buyers could be shown it. */
async function readOpenSales(
  firestore: Firestore,
  uid: string,
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
            'photos',
          )
          .limit(ITEM_LIMIT)
          .get()
          .then((items): ReadSale => ({
            id: doc.id,
            name,
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

async function syncSales(
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> {
  const { sales, isSalesFull } = await readOpenSales(firestore, uid);
  return {
    records: sales.map((sale) =>
      toRecord({
        sourceRef: `sales/${sale.id}`,
        kind: 'project',
        title: sale.name,
        sourceUpdatedAt: sale.updatedAt,
        extra: {
          available: sale.items.filter(
            (item) => item.status === 'AVAILABLE' && item.isListable,
          ).length,
          pending: countStatus(sale.items, 'PENDING'),
          sold: countStatus(sale.items, 'SOLD'),
        },
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
    deepLink: () => '/going-once',
  };
}
