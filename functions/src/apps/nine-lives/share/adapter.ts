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
import { NINE_LIVES_SHARES } from './manifest.js';

const readManifest = () => {
  const [declared] = NINE_LIVES_SHARES.shares;
  if (!declared) throw new Error('Nine Lives declares nothing to share.');
  return declared;
};

const manifest = readManifest();

const DAY_MS = 86_400_000;
const HOUSEHOLD_LIMIT = 50;
const DOC_LIMIT = 500;

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

const readIds = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [];

interface CategoryRead {
  records: SharedRecord[];
  isFull: boolean;
}

interface Household {
  id: string;
  ref: FirebaseFirestore.DocumentReference;
}

interface Clinic {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  updatedAt: number | null;
}

const REASON_LABELS: Record<string, string> = {
  checkup: 'Checkup',
  illness: 'Illness',
  accident: 'Accident',
  vaccination: 'Vaccination',
  follow_up: 'Follow-up',
};

const CONDITION_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  ongoing: 'Ongoing',
  resolved: 'Resolved',
};

const joinNames = (names: string[]) =>
  names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names.slice(-1).join('')}`;

const readDocs = async (query: FirebaseFirestore.Query) => {
  const snapshot = await query.limit(DOC_LIMIT).get();
  return { docs: snapshot.docs, isFull: snapshot.size < DOC_LIMIT };
};

/** Only the households the person is a member of; a household they left no longer lists them. */
async function readHouseholds(firestore: Firestore, uid: string) {
  const snapshot = await firestore
    .collection('apps/nine-lives/households')
    .where('members', 'array-contains', uid)
    .select()
    .limit(HOUSEHOLD_LIMIT)
    .get();
  return {
    households: snapshot.docs.map((doc): Household => ({
      id: doc.id,
      ref: doc.ref,
    })),
    isFull: snapshot.size < HOUSEHOLD_LIMIT,
  };
}

/** Each read selects only the fields a record needs, so a private one is never fetched. */
async function readCatNames(household: Household) {
  const { docs, isFull } = await readDocs(
    household.ref.collection('cats').select('name', 'lastEditedAt'),
  );
  return {
    cats: docs.flatMap((doc) => {
      const name = readText(doc.get('name'));
      return name === null
        ? []
        : [{ id: doc.id, name, updatedAt: readTime(doc.get('lastEditedAt')) }];
    }),
    isFull,
  };
}

async function readClinics(household: Household) {
  const { docs, isFull } = await readDocs(
    household.ref
      .collection('vetClinics')
      .select('name', 'phone', 'address', 'lastEditedAt'),
  );
  return {
    clinics: docs.flatMap((doc): Clinic[] => {
      const name = readText(doc.get('name'));
      return name === null
        ? []
        : [
            {
              id: doc.id,
              name,
              phone: readText(doc.get('phone')),
              address: readText(doc.get('address')),
              updatedAt: readTime(doc.get('lastEditedAt')),
            },
          ];
    }),
    isFull,
  };
}

const inEveryHousehold = async (
  firestore: Firestore,
  uid: string,
  read: (household: Household) => Promise<CategoryRead>,
): Promise<CategoryRead> => {
  const { households, isFull } = await readHouseholds(firestore, uid);
  const reads = await Promise.all(households.map(read));
  return {
    records: reads.flatMap((one) => one.records),
    isFull: isFull && reads.every((one) => one.isFull),
  };
};

const syncCats = (firestore: Firestore, uid: string) =>
  inEveryHousehold(firestore, uid, async (household) => {
    const { cats, isFull } = await readCatNames(household);
    return {
      records: cats.map((cat) =>
        toRecord({
          sourceRef: `households/${household.id}/cats/${cat.id}`,
          kind: 'pet',
          title: cat.name,
          sourceUpdatedAt: cat.updatedAt,
        }),
      ),
      isFull,
    };
  });

const syncClinics = (firestore: Firestore, uid: string) =>
  inEveryHousehold(firestore, uid, async (household) => {
    const { clinics, isFull } = await readClinics(household);
    return {
      records: clinics.map((clinic) =>
        toRecord({
          sourceRef: `households/${household.id}/vetClinics/${clinic.id}`,
          kind: 'place',
          title: clinic.name,
          sourceUpdatedAt: clinic.updatedAt,
          extra: { phone: clinic.phone, address: clinic.address },
        }),
      ),
      isFull,
    };
  });

const syncVisits = (firestore: Firestore, uid: string, windowStart: number) =>
  inEveryHousehold(firestore, uid, async (household) => {
    const [catRead, clinicRead, visitRead] = await Promise.all([
      readCatNames(household),
      readClinics(household),
      readDocs(
        household.ref
          .collection('visits')
          .where('status', '==', 'upcoming')
          .select(
            'catIds',
            'clinicId',
            'reason',
            'customReasonLabel',
            'scheduledAt',
            'lastEditedAt',
          ),
      ),
    ]);
    const catNames = new Map(catRead.cats.map((cat) => [cat.id, cat.name]));
    const clinicNames = new Map(
      clinicRead.clinics.map((clinic) => [clinic.id, clinic.name]),
    );
    return {
      records: visitRead.docs.flatMap((doc) => {
        const scheduledAt = readTime(doc.get('scheduledAt'));
        const names = readIds(doc.get('catIds')).flatMap((id) => {
          const name = catNames.get(id);
          return name === undefined ? [] : [name];
        });
        if (
          scheduledAt === null ||
          scheduledAt < windowStart ||
          names.length === 0
        )
          return [];
        const reason = readText(doc.get('reason')) ?? '';
        const label =
          REASON_LABELS[reason] ??
          readText(doc.get('customReasonLabel')) ??
          'Visit';
        const clinicId = readText(doc.get('clinicId'));
        return [
          toRecord({
            sourceRef: `households/${household.id}/visits/${doc.id}`,
            kind: 'event',
            title: `${joinNames(names)}: ${label}`,
            startAt: scheduledAt,
            placeLabel:
              clinicId === null ? null : (clinicNames.get(clinicId) ?? null),
            sourceUpdatedAt: readTime(doc.get('lastEditedAt')),
          }),
        ];
      }),
      isFull: catRead.isFull && clinicRead.isFull && visitRead.isFull,
    };
  });

const syncDueCare = (firestore: Firestore, uid: string, windowStart: number) =>
  inEveryHousehold(firestore, uid, async (household) => {
    const cutoff = windowStart - DAY_MS;
    const [catRead, vaccinationRead, preventiveRead] = await Promise.all([
      readCatNames(household),
      readDocs(
        household.ref
          .collection('vaccinations')
          .where('expiresAt', '>=', cutoff)
          .select('catId', 'name', 'expiresAt', 'lastEditedAt'),
      ),
      readDocs(
        household.ref
          .collection('preventives')
          .where('expiresAt', '>=', cutoff)
          .select('catIds', 'name', 'expiresAt', 'lastEditedAt'),
      ),
    ]);
    const catNames = new Map(catRead.cats.map((cat) => [cat.id, cat.name]));
    const namesOf = (ids: string[]) =>
      ids.flatMap((id) => {
        const name = catNames.get(id);
        return name === undefined ? [] : [name];
      });
    const dueRecord = (
      collection: string,
      doc: FirebaseFirestore.QueryDocumentSnapshot,
      ids: string[],
      subtitle: string,
    ) => {
      const names = namesOf(ids);
      const name = readText(doc.get('name'));
      const dueAt = readTime(doc.get('expiresAt'));
      if (
        names.length === 0 ||
        name === null ||
        dueAt === null ||
        dueAt < cutoff
      )
        return [];
      return [
        toRecord({
          sourceRef: `households/${household.id}/${collection}/${doc.id}`,
          kind: 'task',
          title: `${joinNames(names)}: ${name}`,
          subtitle,
          dueAt,
          isAllDay: true,
          sourceUpdatedAt: readTime(doc.get('lastEditedAt')),
        }),
      ];
    };
    return {
      records: [
        ...vaccinationRead.docs.flatMap((doc) => {
          const catId = readText(doc.get('catId'));
          return dueRecord(
            'vaccinations',
            doc,
            catId === null ? [] : [catId],
            'Vaccine due',
          );
        }),
        ...preventiveRead.docs.flatMap((doc) =>
          dueRecord(
            'preventives',
            doc,
            readIds(doc.get('catIds')),
            'Preventive due',
          ),
        ),
      ],
      isFull: catRead.isFull && vaccinationRead.isFull && preventiveRead.isFull,
    };
  });

const syncConditions = (firestore: Firestore, uid: string) =>
  inEveryHousehold(firestore, uid, async (household) => {
    const [catRead, conditionRead] = await Promise.all([
      readCatNames(household),
      readDocs(
        household.ref
          .collection('conditions')
          .select('catId', 'name', 'status', 'lastEditedAt'),
      ),
    ]);
    const catNames = new Map(catRead.cats.map((cat) => [cat.id, cat.name]));
    return {
      records: conditionRead.docs.flatMap((doc) => {
        const catId = readText(doc.get('catId'));
        const catName = catId === null ? undefined : catNames.get(catId);
        const name = readText(doc.get('name'));
        if (catName === undefined || name === null) return [];
        const status = readText(doc.get('status')) ?? '';
        return [
          toRecord({
            sourceRef: `households/${household.id}/conditions/${doc.id}`,
            kind: 'knowledge',
            title: name,
            subtitle: catName,
            detail: CONDITION_STATUS_LABELS[status] ?? null,
            sourceUpdatedAt: readTime(doc.get('lastEditedAt')),
          }),
        ];
      }),
      isFull: catRead.isFull && conditionRead.isFull,
    };
  });

export interface NineLivesAdapterDeps {
  firestore: () => Firestore;
  canOpen: (uid: string) => Promise<boolean>;
}

const defaultDeps: NineLivesAdapterDeps = {
  firestore: () => getFirestore(),
  canOpen: async (uid) => {
    const user = await getAuth().getUser(uid);
    return canOpenApp(getFirestore(), 'nine-lives', {
      uid,
      token: {
        email: user.email,
        admin: user.customClaims?.admin,
        dev: user.customClaims?.dev,
      },
    });
  },
};

export function createNineLivesAdapter(
  deps: NineLivesAdapterDeps = defaultDeps,
): SourceAdapter {
  const readCategory = (uid: string, req: SyncPageRequest) => {
    const firestore = deps.firestore();
    switch (req.category) {
      case 'cats':
        return syncCats(firestore, uid);
      case 'vetVisits':
        return syncVisits(firestore, uid, req.windowStart);
      case 'dueCare':
        return syncDueCare(firestore, uid, req.windowStart);
      case 'clinics':
        return syncClinics(firestore, uid);
      case 'conditions':
        return syncConditions(firestore, uid);
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
    deepLink: () => '/nine-lives',
  };
}
