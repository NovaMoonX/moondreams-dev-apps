import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { canOpenApp } from '../../../appAccess.js';
import type {
  LiveQueryResult,
  SourceAdapter,
  SourceCtx,
  SyncPageRequest,
  SyncPageResult,
} from '../../../connections/registry.js';
import { dayRangeMs } from '../../../connections/liveDay.js';
import {
  MAX_RECORDS_PER_CATEGORY,
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
const UPCOMING_LOOKBACK_DAYS = 30;
const PAST_VISIT_LIMIT = 50;
const DOCTOR_LIMIT = 10;
const DOC_LIMIT = 500;
const DETAIL_CLIP = 120;
const SYMPTOM_CLIP = 160;
const SYMPTOM_TAG_LIMIT = 8;
const EXPENSE_CURRENCY = 'USD';

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
  isEmergency24Hour: boolean;
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

const SEVERITY_LABELS: Record<string, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
};

const clipTo = (text: string, limit: number) =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;

const toTagLabel = (tag: string) => {
  const words = tag.replace(/_/g, ' ').trim();
  return `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`;
};

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A date picked with no time is UTC midnight, so it reads in UTC. */
const formatDay = (value: number) => dayFormatter.format(new Date(value));

/** A dose logged with a tap is an instant in a zone the household doesn't store, so its day may be one off. */
const formatGivenDay = (value: number) =>
  value % DAY_MS === 0 ? formatDay(value) : `around ${formatDay(value)}`;

const joinLines = (parts: Array<string | null>) =>
  parts.flatMap((part) => (part === null ? [] : [part])).join(' · ') || null;

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
async function readCatNames(household: Household, extraFields: string[] = []) {
  const { docs, isFull } = await readDocs(
    household.ref
      .collection('cats')
      .select('name', 'lastEditedAt', ...extraFields),
  );
  return {
    cats: docs.flatMap((doc) => {
      const name = readText(doc.get('name'));
      return name === null
        ? []
        : [
            {
              id: doc.id,
              name,
              updatedAt: readTime(doc.get('lastEditedAt')),
              doc,
            },
          ];
    }),
    isFull,
  };
}

async function readDoctors(household: Household) {
  const { docs, isFull } = await readDocs(
    household.ref.collection('doctors').select('name', 'clinicId'),
  );
  return {
    doctors: docs.flatMap((doc) => {
      const name = readText(doc.get('name'));
      return name === null
        ? []
        : [{ id: doc.id, name, clinicId: readText(doc.get('clinicId')) }];
    }),
    isFull,
  };
}

async function readClinics(household: Household) {
  const { docs, isFull } = await readDocs(
    household.ref
      .collection('vetClinics')
      .select('name', 'phone', 'address', 'isEmergency24Hour', 'lastEditedAt'),
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
              isEmergency24Hour: doc.get('isEmergency24Hour') === true,
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

/** Where the app keeps a cat's photo; the reader's server copies the bytes from here, so a picture's address never travels. */
const toCatPhotoPath = (householdId: string, catId: string) =>
  `nine-lives/households/${householdId}/cats/${catId}/photo`;

const syncCats = (firestore: Firestore, uid: string) =>
  inEveryHousehold(firestore, uid, async (household) => {
    const { cats, isFull } = await readCatNames(household, [
      'dateOfBirth',
      'isDateOfBirthEstimated',
      'breed',
      'diet.foodType',
      'diet.brand',
      'photoURL',
    ]);
    return {
      records: cats.map((cat) => {
        const born = readTime(cat.doc.get('dateOfBirth')) || null;
        const food = readText(
          [
            readText(cat.doc.get('diet.brand')),
            readText(cat.doc.get('diet.foodType')),
          ]
            .filter(Boolean)
            .join(' '),
        );
        return toRecord({
          sourceRef: `households/${household.id}/cats/${cat.id}`,
          kind: 'pet',
          title: cat.name,
          detail: joinLines([
            born === null
              ? null
              : `Born ${cat.doc.get('isDateOfBirthEstimated') === true ? 'about ' : ''}${formatDay(born)}`,
            readText(cat.doc.get('breed')),
            food === null ? null : `Food: ${food}`,
          ]),
          sourceUpdatedAt: cat.updatedAt,
          extra:
            readText(cat.doc.get('photoURL')) === null
              ? {}
              : { photoPath: toCatPhotoPath(household.id, cat.id) },
        });
      }),
      isFull,
    };
  });

const hasPlainName = (doctor: { name: string }) => !doctor.name.includes('@');

const syncClinics = (firestore: Firestore, uid: string) =>
  inEveryHousehold(firestore, uid, async (household) => {
    const [clinicRead, doctorRead] = await Promise.all([
      readClinics(household),
      readDoctors(household),
    ]);
    return {
      records: clinicRead.clinics.map((clinic) => {
        const doctors = doctorRead.doctors
          .filter(
            (doctor) => doctor.clinicId === clinic.id && hasPlainName(doctor),
          )
          .slice(0, DOCTOR_LIMIT)
          .map((doctor) => doctor.name);
        return toRecord({
          sourceRef: `households/${household.id}/vetClinics/${clinic.id}`,
          kind: 'place',
          title: clinic.name,
          detail: joinLines([
            clinic.isEmergency24Hour ? 'Open 24 hours for emergencies' : null,
            doctors.length === 0 ? null : `Doctors: ${doctors.join(', ')}`,
          ]),
          sourceUpdatedAt: clinic.updatedAt,
          extra: { phone: clinic.phone, address: clinic.address },
        });
      }),
      isFull: clinicRead.isFull && doctorRead.isFull,
    };
  });

const syncVets = (firestore: Firestore, uid: string) =>
  inEveryHousehold(firestore, uid, async (household) => {
    const [clinicRead, doctorRead] = await Promise.all([
      readClinics(household),
      readDoctors(household),
    ]);
    const clinicNames = new Map(
      clinicRead.clinics.map((clinic) => [clinic.id, clinic.name]),
    );
    return {
      records: doctorRead.doctors.filter(hasPlainName).map((doctor) => {
        const clinic =
          doctor.clinicId === null
            ? undefined
            : clinicNames.get(doctor.clinicId);
        return toRecord({
          sourceRef: `households/${household.id}/doctors/${doctor.id}`,
          kind: 'person',
          title: doctor.name,
          detail: clinic === undefined ? 'Veterinarian' : `Vet at ${clinic}`,
          placeLabel: clinic ?? null,
        });
      }),
      isFull: clinicRead.isFull && doctorRead.isFull,
    };
  });

const syncVisits = (firestore: Firestore, uid: string, windowStart: number) =>
  inEveryHousehold(firestore, uid, async (household) => {
    const upcomingStart = Date.now() - UPCOMING_LOOKBACK_DAYS * DAY_MS;
    const [catRead, clinicRead, doctorRead, visitRead] = await Promise.all([
      readCatNames(household),
      readClinics(household),
      readDoctors(household),
      readDocs(
        household.ref
          .collection('visits')
          .where('scheduledAt', '>=', windowStart)
          .orderBy('scheduledAt', 'desc')
          .select(
            'catIds',
            'clinicId',
            'doctorId',
            'status',
            'reason',
            'customReasonLabel',
            'scheduledAt',
            'lastEditedAt',
          ),
      ),
    ]);
    const doctorNames = new Map(
      doctorRead.doctors.map((doctor) => [doctor.id, doctor.name]),
    );
    const catNames = new Map(catRead.cats.map((cat) => [cat.id, cat.name]));
    const clinicNames = new Map(
      clinicRead.clinics.map((clinic) => [clinic.id, clinic.name]),
    );
    const visitRecords = visitRead.docs.flatMap((doc) => {
      const status = readText(doc.get('status'));
      const scheduledAt = readTime(doc.get('scheduledAt'));
      const names = readIds(doc.get('catIds')).flatMap((id) => {
        const name = catNames.get(id);
        return name === undefined ? [] : [name];
      });
      const isPast = status === 'completed';
      if (
        scheduledAt === null ||
        names.length === 0 ||
        (!isPast && (status !== 'upcoming' || scheduledAt < upcomingStart))
      )
        return [];
      const reason = readText(doc.get('reason')) ?? '';
      const label =
        (Object.hasOwn(REASON_LABELS, reason) ? REASON_LABELS[reason] : null) ??
        readText(doc.get('customReasonLabel')) ??
        'Visit';
      const clinicId = readText(doc.get('clinicId'));
      const doctorId = readText(doc.get('doctorId'));
      const doctorName =
        doctorId === null ? undefined : doctorNames.get(doctorId);
      return [
        {
          isPast,
          record: toRecord({
            sourceRef: `households/${household.id}/visits/${doc.id}`,
            kind: 'event',
            title: `${joinNames(names)}: ${label}`,
            subtitle: isPast ? 'Past visit' : null,
            detail: doctorName === undefined ? null : `Doctor: ${doctorName}`,
            startAt: scheduledAt,
            placeLabel:
              clinicId === null ? null : (clinicNames.get(clinicId) ?? null),
            sourceUpdatedAt: readTime(doc.get('lastEditedAt')),
          }),
        },
      ];
    });
    return {
      records: [
        ...visitRecords.filter((visit) => !visit.isPast),
        ...visitRecords
          .filter((visit) => visit.isPast)
          .slice(0, PAST_VISIT_LIMIT),
      ].map((visit) => visit.record),
      isFull:
        catRead.isFull &&
        clinicRead.isFull &&
        doctorRead.isFull &&
        visitRead.isFull,
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
          .select(
            'catId',
            'name',
            'expiresAt',
            'lastAdministeredAt',
            'lastEditedAt',
          ),
      ),
      readDocs(
        household.ref
          .collection('preventives')
          .where('expiresAt', '>=', cutoff)
          .select(
            'catIds',
            'name',
            'expiresAt',
            'lastAdministeredAt',
            'lastEditedAt',
          ),
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
      const lastGiven = readTime(doc.get('lastAdministeredAt'));
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
          detail:
            lastGiven === null
              ? null
              : `Last given ${formatGivenDay(lastGiven)}`,
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
            detail: Object.hasOwn(CONDITION_STATUS_LABELS, status)
              ? CONDITION_STATUS_LABELS[status]
              : null,
            sourceUpdatedAt: readTime(doc.get('lastEditedAt')),
          }),
        ];
      }),
      isFull: catRead.isFull && conditionRead.isFull,
    };
  });

const syncSymptoms = (firestore: Firestore, uid: string, windowStart: number) =>
  inEveryHousehold(firestore, uid, async (household) => {
    const [catRead, symptomRead] = await Promise.all([
      readCatNames(household),
      readDocs(
        household.ref
          .collection('symptoms')
          .where('firstNoticedAt', '>=', windowStart)
          .select(
            'catId',
            'description',
            'quickTags',
            'firstNoticedAt',
            'severity',
            'lastEditedAt',
          ),
      ),
    ]);
    const catNames = new Map(catRead.cats.map((cat) => [cat.id, cat.name]));
    return {
      records: symptomRead.docs.flatMap((doc) => {
        const catId = readText(doc.get('catId'));
        const catName = catId === null ? undefined : catNames.get(catId);
        const description = readText(doc.get('description'));
        const noticedAt = readTime(doc.get('firstNoticedAt'));
        if (catName === undefined || noticedAt === null) return [];
        const tags = readIds(doc.get('quickTags'))
          .filter((tag) => tag !== 'other')
          .map(toTagLabel)
          .slice(0, SYMPTOM_TAG_LIMIT);
        const severityKey = readText(doc.get('severity')) ?? '';
        const severity = Object.hasOwn(SEVERITY_LABELS, severityKey)
          ? SEVERITY_LABELS[severityKey]
          : null;
        const detail = joinLines([
          severity,
          `First noticed ${formatDay(noticedAt)}`,
          tags.length === 0 ? null : tags.join(', '),
        ]);
        return [
          toRecord({
            sourceRef: `households/${household.id}/symptoms/${doc.id}`,
            kind: 'knowledge',
            title: clipTo(
              description ?? (tags.join(', ') || 'Symptom'),
              SYMPTOM_CLIP,
            ),
            subtitle: catName,
            detail: detail === null ? null : clipTo(detail, DETAIL_CLIP),
            sourceUpdatedAt: readTime(doc.get('lastEditedAt')),
          }),
        ];
      }),
      isFull: catRead.isFull && symptomRead.isFull,
    };
  });

interface LiveArgs {
  text: string | null;
  from: number | null;
  to: number | null;
  fromMs: number | null;
  toMsExclusive: number | null;
}

interface LiveRow {
  at: number;
  record: SharedRecord;
}

interface LiveRead {
  rows: LiveRow[];
  isFull: boolean;
}

const readDayArg = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().startsWith(value)
    ? at
    : null;
};

const toDayText = (at: number | null) =>
  at === null ? null : new Date(at).toISOString().slice(0, 10);

const readLiveArgs = (args: unknown): LiveArgs => {
  const asked =
    typeof args === 'object' && args !== null && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  const from = readDayArg(asked.from);
  const to = readDayArg(asked.to);
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

/** A value on UTC midnight is a picked date; any other is a moment, read in the person's day. */
const isInRange = (at: number, args: LiveArgs) => {
  const isDate = at % DAY_MS === 0;
  const start = isDate ? args.from : args.fromMs;
  const end = isDate
    ? args.to === null
      ? null
      : args.to + DAY_MS
    : args.toMsExclusive;
  return (start === null || at >= start) && (end === null || at < end);
};

const withRange = (
  query: FirebaseFirestore.Query,
  field: string,
  { from, to, fromMs, toMsExclusive }: LiveArgs,
) => {
  const lowerBound =
    from === null || fromMs === null ? null : Math.min(from, fromMs);
  const upperBound =
    to === null || toMsExclusive === null
      ? null
      : Math.max(to + DAY_MS, toMsExclusive);
  const lower =
    lowerBound === null ? query : query.where(field, '>=', lowerBound);
  return (
    upperBound === null ? lower : lower.where(field, '<', upperBound)
  ).orderBy(field, 'desc');
};

const isTextMatch = (text: string | null, parts: string[]) =>
  text === null || parts.some((part) => part.toLowerCase().includes(text));

const readCatNameMap = async (household: Household) => {
  const { cats, isFull } = await readCatNames(household);
  return {
    names: new Map(cats.map((cat) => [cat.id, cat.name])),
    isFull,
  };
};

const namesOfCats = (names: Map<string, string>, ids: string[]) =>
  ids.flatMap((id) => {
    const name = names.get(id);
    return name === undefined ? [] : [name];
  });

const liveVisitNotes = (household: Household, args: LiveArgs) =>
  Promise.all([
    readCatNameMap(household),
    readDocs(household.ref.collection('vetClinics').select('name')),
    readDocs(
      withRange(
        household.ref
          .collection('visits')
          .select(
            'catIds',
            'clinicId',
            'status',
            'reason',
            'customReasonLabel',
            'scheduledAt',
            'summary',
          ),
        'scheduledAt',
        args,
      ),
    ),
  ]).then(([catRead, clinicRead, visitRead]): LiveRead => {
    const clinicNames = new Map(
      clinicRead.docs.map((doc) => [doc.id, readText(doc.get('name'))]),
    );
    return {
      rows: visitRead.docs.flatMap((doc) => {
        const scheduledAt = readTime(doc.get('scheduledAt'));
        const names = namesOfCats(catRead.names, readIds(doc.get('catIds')));
        if (
          scheduledAt === null ||
          !isInRange(scheduledAt, args) ||
          names.length === 0 ||
          doc.get('status') !== 'completed'
        )
          return [];
        const reason = readText(doc.get('reason')) ?? '';
        const label =
          (Object.hasOwn(REASON_LABELS, reason)
            ? REASON_LABELS[reason]
            : null) ??
          readText(doc.get('customReasonLabel')) ??
          'Visit';
        const title = `${joinNames(names)}: ${label}`;
        const notes = readText(doc.get('summary'));
        const clinicId = readText(doc.get('clinicId'));
        return isTextMatch(args.text, [title, ...names])
          ? [
              {
                at: scheduledAt,
                record: toRecord({
                  sourceRef: `households/${household.id}/visits/${doc.id}`,
                  kind: 'event',
                  title,
                  subtitle: 'Past visit',
                  detail:
                    notes === null
                      ? null
                      : clipTo(notes.replace(/\s+/g, ' '), DETAIL_CLIP),
                  startAt: scheduledAt,
                  placeLabel:
                    clinicId === null
                      ? null
                      : (clinicNames.get(clinicId) ?? null),
                }),
              },
            ]
          : [];
      }),
      isFull: catRead.isFull && clinicRead.isFull && visitRead.isFull,
    };
  });

const asObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const liveDoseHistory = (household: Household, args: LiveArgs) =>
  Promise.all([
    readCatNameMap(household),
    readDocs(
      household.ref
        .collection('vaccinations')
        .select('catId', 'name', 'history', 'lastAdministeredAt'),
    ),
    readDocs(
      household.ref
        .collection('preventives')
        .select('catIds', 'name', 'history', 'lastAdministeredAt'),
    ),
  ]).then(([catRead, vaccinationRead, preventiveRead]): LiveRead => {
    const doseRows = (
      collection: string,
      subtitle: string,
      doc: FirebaseFirestore.QueryDocumentSnapshot,
      ids: string[],
    ) => {
      const names = namesOfCats(catRead.names, ids);
      const name = readText(doc.get('name'));
      const history = doc.get('history');
      const logged = (Array.isArray(history) ? history : []).flatMap(
        (entry) => {
          const dose = asObject(entry);
          const at = readTime(dose?.administeredAt);
          return at === null
            ? []
            : [{ at, dosage: readText(dose?.dosage), id: readText(dose?.id) }];
        },
      );
      const lastGiven = readTime(doc.get('lastAdministeredAt'));
      const doses =
        logged.length > 0
          ? logged
          : lastGiven === null
            ? []
            : [{ at: lastGiven, dosage: null, id: null }];
      if (names.length === 0 || name === null) return [];
      const title = `${joinNames(names)}: ${name}`;
      return doses.flatMap((dose, index) =>
        isInRange(dose.at, args) && isTextMatch(args.text, [title, ...names])
          ? [
              {
                at: dose.at,
                record: toRecord({
                  sourceRef: `households/${household.id}/${collection}/${doc.id}/doses/${dose.id ?? index}`,
                  kind: 'event',
                  title,
                  subtitle,
                  detail: clipTo(
                    joinLines([
                      `Given ${formatGivenDay(dose.at)}`,
                      dose.dosage === null ? null : `Dosage: ${dose.dosage}`,
                    ]) ?? '',
                    DETAIL_CLIP,
                  ),
                  startAt: dose.at,
                  isAllDay: dose.at % DAY_MS === 0,
                }),
              },
            ]
          : [],
      );
    };
    return {
      rows: [
        ...vaccinationRead.docs.flatMap((doc) => {
          const catId = readText(doc.get('catId'));
          return doseRows(
            'vaccinations',
            'Vaccine given',
            doc,
            catId === null ? [] : [catId],
          );
        }),
        ...preventiveRead.docs.flatMap((doc) =>
          doseRows(
            'preventives',
            'Preventive given',
            doc,
            readIds(doc.get('catIds')),
          ),
        ),
      ],
      isFull: catRead.isFull && vaccinationRead.isFull && preventiveRead.isFull,
    };
  });

const liveWeights = (household: Household, args: LiveArgs) =>
  Promise.all([
    readCatNameMap(household),
    readDocs(
      withRange(
        household.ref
          .collection('weightEntries')
          .select('catId', 'weight', 'unit', 'measuredAt'),
        'measuredAt',
        args,
      ),
    ),
  ]).then(([catRead, weightRead]): LiveRead => ({
    rows: weightRead.docs.flatMap((doc) => {
      const catId = readText(doc.get('catId'));
      const catName = catId === null ? undefined : catRead.names.get(catId);
      const weight = doc.get('weight');
      const unit = doc.get('unit');
      const measuredAt = readTime(doc.get('measuredAt'));
      if (
        catName === undefined ||
        typeof weight !== 'number' ||
        !Number.isFinite(weight) ||
        (unit !== 'lb' && unit !== 'kg') ||
        measuredAt === null ||
        !isInRange(measuredAt, args) ||
        !isTextMatch(args.text, [catName])
      )
        return [];
      return [
        {
          at: measuredAt,
          record: toRecord({
            sourceRef: `households/${household.id}/weightEntries/${doc.id}`,
            kind: 'knowledge',
            title: `${catName}: ${Number(weight.toFixed(2))} ${unit}`,
            subtitle: catName,
            detail: `Weighed ${formatGivenDay(measuredAt)}`,
            startAt: measuredAt,
            isAllDay: measuredAt % DAY_MS === 0,
          }),
        },
      ];
    }),
    isFull: catRead.isFull && weightRead.isFull,
  }));

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** An expense shared by several cats is split evenly in cents, the first cats taking the odd ones. */
const splitCents = (cents: number, count: number) =>
  Array.from(
    { length: count },
    (_, index) => Math.floor(cents / count) + (index < cents % count ? 1 : 0),
  );

const liveCatExpenses = (household: Household, args: LiveArgs) =>
  Promise.all([
    readCatNameMap(household),
    readDocs(
      withRange(
        household.ref
          .collection('expenses')
          .select('catIds', 'amount', 'incurredAt'),
        'incurredAt',
        args,
      ),
    ),
  ]).then(([catRead, expenseRead]): LiveRead => {
    const shares = expenseRead.docs.flatMap((doc) => {
      const amount = doc.get('amount');
      const incurredAt = readTime(doc.get('incurredAt'));
      const ids = readIds(doc.get('catIds')).filter((id) =>
        catRead.names.has(id),
      );
      if (
        typeof amount !== 'number' ||
        !Number.isFinite(amount) ||
        incurredAt === null ||
        !isInRange(incurredAt, args) ||
        ids.length === 0
      )
        return [];
      const month = new Date(incurredAt);
      const monthStart = Date.UTC(month.getUTCFullYear(), month.getUTCMonth());
      return splitCents(Math.round(amount * 100), ids.length).map(
        (cents, index) => ({ catId: ids[index], monthStart, cents }),
      );
    });
    const totals = shares.reduce((found, share) => {
      const key = `${share.catId}/${share.monthStart}`;
      const before = found.get(key);
      return found.set(key, {
        ...share,
        cents: (before?.cents ?? 0) + share.cents,
        count: (before?.count ?? 0) + 1,
      });
    }, new Map<string, (typeof shares)[number] & { count: number }>());
    return {
      rows: [...totals.values()].flatMap((total) => {
        const catName = catRead.names.get(total.catId) ?? '';
        const label = monthFormatter.format(total.monthStart);
        return isTextMatch(args.text, [`${catName}: ${label}`, catName])
          ? [
              {
                at: total.monthStart,
                record: toRecord({
                  sourceRef: `households/${household.id}/catExpenses/${total.catId}/${new Date(total.monthStart).toISOString().slice(0, 7)}`,
                  kind: 'artifact',
                  title: `${catName}: ${label}`,
                  subtitle: catName,
                  detail: `${total.count} ${total.count === 1 ? 'expense' : 'expenses'}`,
                  startAt: total.monthStart,
                  isAllDay: true,
                  amountCents: total.cents,
                  currency: EXPENSE_CURRENCY,
                }),
              },
            ]
          : [];
      }),
      isFull: catRead.isFull && expenseRead.isFull,
    };
  });

const LIVE_READERS: Record<
  string,
  (household: Household, args: LiveArgs) => Promise<LiveRead>
> = {
  visitNotes: liveVisitNotes,
  doseHistory: liveDoseHistory,
  weights: liveWeights,
  catExpenses: liveCatExpenses,
};

async function queryCare(
  firestore: Firestore,
  uid: string,
  category: string,
  args: LiveArgs,
): Promise<LiveQueryResult> {
  const read = Object.hasOwn(LIVE_READERS, category)
    ? LIVE_READERS[category]
    : null;
  if (read === null) throw new Error('Unknown category.');
  const { households, isFull } = await readHouseholds(firestore, uid);
  const reads = await Promise.all(
    households.map((household) => read(household, args)),
  );
  const rows = reads
    .flatMap((one) => one.rows)
    .sort(
      (a, b) =>
        b.at - a.at || a.record.sourceRef.localeCompare(b.record.sourceRef),
    );
  const isMoney = category === 'catExpenses';
  return {
    records: rows.slice(0, MAX_RECORDS_PER_CATEGORY).map((row) => row.record),
    matchedCount: rows.length,
    totalCents: isMoney
      ? rows.reduce((sum, row) => sum + (row.record.amountCents ?? 0), 0)
      : null,
    currency: isMoney ? EXPENSE_CURRENCY : null,
    isPartial:
      !isFull ||
      reads.some((one) => !one.isFull) ||
      rows.length > MAX_RECORDS_PER_CATEGORY,
    from: toDayText(args.from),
    to: toDayText(args.to),
  };
}

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
      case 'vets':
        return syncVets(firestore, uid);
      case 'conditions':
        return syncConditions(firestore, uid);
      case 'symptoms':
        return syncSymptoms(firestore, uid, req.windowStart);
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
    query: (ctx, req) =>
      queryCare(
        deps.firestore(),
        ctx.uid,
        req.category,
        readLiveArgs(req.args),
      ),
    deepLink: () => '/nine-lives',
  };
}
