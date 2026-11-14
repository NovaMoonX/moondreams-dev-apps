import { createHash } from 'node:crypto';

import { wrapDataKey } from '../../functions/src/appKeys/wrap.ts';
import { A_LIST_SHARES } from '../../functions/src/apps/a-list/share/manifest.ts';
import {
  deriveSeedDataKey,
  keyCheckPath,
  makeKeyCheck,
  sealForHelm,
  wrappedKeyPath,
} from '../../functions/src/apps/helm/helmKey.ts';
import { NINE_LIVES_SHARES } from '../../functions/src/apps/nine-lives/share/manifest.ts';
import { RUNWAY_SHARES } from '../../functions/src/apps/runway/share/manifest.ts';
import { PINCH_SHARES } from '../../functions/src/apps/pinch/share/manifest.ts';
import { WAYPOINT_SHARES } from '../../functions/src/apps/waypoint/share/manifest.ts';
import {
  DEFAULT_DAY_END_TIME,
  DEFAULT_DAY_START_TIME,
  DEFAULT_PLAN_FILL_PERCENT,
  PHOTOS_PER_RECORD,
} from '../../src/apps/helm/constants.ts';
import { sealJson } from '../../src/apps/helm/security.ts';
import type {
  Capture,
  CaptureSealed,
  Fact,
  FactSealed,
  HelmEncryption,
  KeyDate,
  KeyDateIndexEntry,
  KeyDateSealed,
  Media,
  Note,
  NoteSealed,
  Procedure,
  ProcedureRun,
  ProcedureSealed,
  ProcedureVersion,
  ProcedureVersionSealed,
  Project,
  ProjectSealed,
  RunSealed,
  Task,
  TaskDue,
  TaskSealed,
  Topic,
  TopicSealed,
  TopicSection,
  TopicVersion,
  TopicVersionSealed,
  Who,
  WhoSealed,
} from '../../src/apps/helm/types.ts';
import { planIndexWrite } from '../../src/apps/helm/utils/keyDateIndex.ts';
import { getMediaObjectPath } from '../../src/apps/helm/utils/mediaPath.ts';
import { toStepState } from '../../src/apps/helm/utils/stepGroups.ts';
import {
  SITE_ACCOUNT_ID,
  toAppConnectorId,
  toGrantId,
  type ConnectionGrant,
} from '../../src/lib/connections/contract.ts';
import { buildSeedPhoto, toWho, uploadSealedSeed, wordsOf } from './helm.ts';
import { readEmulatorKeyring } from './runway.ts';
import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const BATCH_SIZE = 200;
const CHUNK = 250;

const TASK_COUNT = 600;
const WHO_COUNT = 2_000;
const YEARLY_PER_WHO = 2;
const MOMENT_TOTAL = 16_000;
const MOMENTS_FOR_ONE_WHO = 500;
const FACT_COUNT = 2_000;
const NOTE_COUNT = 300;
const TOPIC_ROOTS = 8;
const PROCEDURE_COUNT = 30;
const RUN_COUNT = 120;
const OPEN_RUNS = 12;
const TURN_COUNT = 400;
const SESSION_COUNT = 60;
const MEDIA_COUNT = 200;
const PROJECT_COUNT = 40;
const OWNER_TIME_ZONE = 'America/New_York';

const FIRST_NAMES = [
  'Ava',
  'Noah',
  'Mila',
  'Liam',
  'Zoe',
  'Ethan',
  'Nora',
  'Owen',
  'Ivy',
  'Lucas',
  'Maya',
  'Leo',
  'Ruby',
  'Isaac',
  'Elena',
  'Caleb',
  'Hana',
  'Jonas',
  'Priya',
  'Mateo',
  'Sofia',
  'Theo',
  'Amara',
  'Felix',
  'Lena',
  'Omar',
  'Greta',
  'Diego',
  'Yuki',
  'Hugo',
  'Talia',
  'Rafael',
  'Imani',
  'Silas',
  'Clara',
  'Emil',
  'Naomi',
  'Arjun',
  'Wren',
  'Dmitri',
  'Esme',
  'Kofi',
  'Marta',
  'Anders',
  'Leila',
  'Tomas',
  'Rosa',
  'Kenji',
  'Edith',
  'Sami',
  'Petra',
  'Joaquin',
  'Anika',
  'Basil',
  'Delia',
  'Idris',
  'Fiona',
  'Nico',
  'Odette',
  'Rhys',
];
const LAST_NAMES = [
  'Okafor',
  'Lindqvist',
  'Moreau',
  'Tanaka',
  'Whitfield',
  'Castillo',
  'Novak',
  'Hartley',
  'Bianchi',
  'Adeyemi',
  'Sorensen',
  'Patel',
  'Delgado',
  'Kowalski',
  'Ashworth',
  'Nakamura',
  'Fontaine',
  'Brennan',
  'Ibrahim',
  'Marsh',
  'Vasquez',
  'Lund',
  'Ferrara',
  'Oyelaran',
  'Holloway',
  'Zimmer',
  'Rao',
  'Dupont',
  'Keller',
  'Mbeki',
  'Sandoval',
  'Eriksen',
  'Quinn',
  'Haddad',
  'Pruitt',
  'Svoboda',
  'Larkin',
  'Obi',
  'Reyes',
  'Thorne',
  'Abara',
  'Beckett',
  'Chen',
  'Dhillon',
  'Easton',
  'Fujita',
  'Gallo',
  'Hosseini',
  'Ivanov',
  'Jovanovic',
  'Kaplan',
  'Laurent',
  'Mensah',
  'Nilsson',
  'Ortega',
  'Park',
  'Rossi',
  'Sato',
  'Tran',
  'Underwood',
];
const PET_NAMES = [
  'Miso',
  'Pixel',
  'Biscuit',
  'Juniper',
  'Waffles',
  'Olive',
  'Pepper',
  'Mochi',
  'Clover',
  'Bean',
];
const SPECIES = ['Cat', 'Dog', 'Rabbit', 'Parrot'];
const ORG_KINDS = [
  'Bakery',
  'Hardware',
  'Dental',
  'Clinic',
  'Studio',
  'Books',
  'Garage',
  'Cafe',
];
const RELATIONS = [
  'work friend',
  'neighbor',
  'cousin',
  'college roommate',
  'book club',
  'old teammate',
  'my dentist',
  'the florist',
];
const TASK_VERBS = [
  'Call',
  'Book',
  'Renew',
  'Order',
  'Send',
  'Pick up',
  'Draft',
  'Review',
  'Fix',
  'Return',
  'Plan',
  'Pay',
  'Cancel',
  'Schedule',
  'Water',
];
const TASK_OBJECTS = [
  'the car registration',
  'a gift for the neighbors',
  'the dentist appointment',
  'passport photos',
  'the garden hose',
  'tax paperwork',
  'the lease renewal',
  'a thank-you card',
  'the vet records',
  'the broken hinge',
  'insurance quote',
  'winter tyres',
  'the library books',
  'wedding RSVPs',
  'the project outline',
  'a birthday cake',
  'the energy bill',
  'the spare key',
  'the online course',
  'the moving boxes',
];
const FACT_TEMPLATES = [
  'prefers tea over coffee',
  'is allergic to shellfish',
  'lives near the river',
  'works night shifts on Fridays',
  'loves hiking in the fall',
  'drives a green hatchback',
  'plays the cello',
  'moved to Denver in the spring',
  'does not eat pork',
  'collects vinyl records',
  'runs a small pottery studio',
  'is training for a half marathon',
  'speaks Portuguese at home',
  'is vegetarian',
  'reads mystery novels on trains',
];
const NOTE_SUBJECTS = [
  'sourdough',
  'tyre pressure',
  'router settings',
  'tomato blight',
  'visa rules',
  'oil changes',
  'tax receipts',
  'wifi password',
  'camera lenses',
  'running shoes',
  'ceramic glaze',
  'bike gears',
  'espresso grind',
  'travel adapters',
];
const TOPIC_NAMES = [
  'Home',
  'Cooking',
  'Garden',
  'Cars',
  'Money',
  'Travel',
  'Health',
  'Work',
  'Repairs',
  'Baking',
  'Tomatoes',
  'Tyres',
  'Taxes',
  'Visas',
  'Sleep',
  'Meetings',
  'Plumbing',
  'Bread',
  'Heirlooms',
  'Winter',
  'Receipts',
  'Packing',
  'Running',
  'Planning',
  'Taps',
  'Starters',
  'Staking',
  'Chains',
  'Filing',
  'Adapters',
  'Stretching',
  'Retros',
  'Washers',
  'Rye',
  'Seedlings',
  'Studs',
  'Audits',
  'Insurance',
  'Naps',
  'Agendas',
];
const PROCEDURE_TITLES = [
  'Morning routine',
  'Packing for a trip',
  'Closing the cabin',
  'Weekly review',
  'Moving out',
  'Hosting dinner',
  'Car service',
  'Spring cleaning',
  'Taxes',
  'New hire onboarding',
];
const PROJECT_NAMES = [
  'Kitchen refit',
  'Garden beds',
  'Wedding weekend',
  'Move to Denver',
  'Tax year',
  'Half marathon',
  'Bathroom tiles',
  'Family reunion',
  'Book draft',
  'Car restoration',
];
const TURN_TEXTS = [
  'remind me to call %s on Thursday',
  'add a task to renew the passport',
  'what did %s say about the move',
  'put the garden hose on my list',
  'remember that %s likes oat milk',
  'make a note about the router settings',
  'when is %s birthday',
  'plan my Saturday',
  'I need to pay the energy bill by Friday',
];
const SHARE_PLACES = [
  'Seattle',
  'Lisbon',
  'Kansas City',
  'Denver',
  'Portland',
  'Austin',
];
const THEATERS = [
  'AMC Town Center 20',
  'Alamo Drafthouse',
  'Regal Union Square',
  'Cinemark Legacy',
];
const MEALS = [
  'Lemon pasta',
  'Sheet-pan chicken',
  'Mushroom risotto',
  'Black bean tacos',
  'Miso salmon',
  'Pad thai',
];
const SHOPPING = [
  'Lemons',
  'Spaghetti',
  'Tortillas',
  'Oat milk',
  'Basil',
  'Garlic',
  'Rice',
  'Eggs',
];

/** A small seeded generator so every run writes the same fixture. */
function makeRandom(seed: number) {
  const state = { value: seed };
  return () => {
    state.value = (state.value + 0x6d2b79f5) | 0;
    const mixed = Math.imul(
      state.value ^ (state.value >>> 15),
      1 | state.value,
    );
    return (
      (((mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed) >>> 0) /
      4_294_967_296
    );
  };
}

const random = makeRandom(20_261_111);
const between = (low: number, high: number) =>
  low + Math.floor(random() * (high - low + 1));
const pick = <T>(list: readonly T[]) => list[between(0, list.length - 1)];
const pad = (value: number, size = 4) => String(value).padStart(size, '0');
const range = (count: number) => Array.from({ length: count }, (_, i) => i);

/** Runs `build` over a list a chunk at a time so the sealing never holds thousands of promises at once. */
async function mapChunked<T, R>(
  items: T[],
  build: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  return items.reduce<Promise<R[]>>(async (previous, _item, index) => {
    const done = await previous;
    if (index % CHUNK !== 0) return done;
    const slice = items.slice(index, index + CHUNK);
    return [
      ...done,
      ...(await Promise.all(
        slice.map((entry, offset) => build(entry, index + offset)),
      )),
    ];
  }, Promise.resolve([]));
}

const whoIdOf = (index: number) =>
  index === 0 ? 'self' : `scale-who-${pad(index)}`;

/** The 500-moment who is always the second one. */
const MOMENT_HEAVY_INDEX = 1;

/** Photos per who: the heavy one holds a full record's worth, every other who with a low index one. */
const photoOwnerOf = (mediaIndex: number) =>
  mediaIndex >= MEDIA_COUNT - (PHOTOS_PER_RECORD - 1)
    ? MOMENT_HEAVY_INDEX
    : mediaIndex;

const photoIdsOf = (index: number) =>
  range(MEDIA_COUNT)
    .filter((mediaIndex) => photoOwnerOf(mediaIndex) === index)
    .map((mediaIndex) => `scale-media-${pad(mediaIndex)}`);

/** Moments per who: the heavy one holds 500, every other who an even share of the rest. */
const momentsOf = (index: number) => {
  if (index === MOMENT_HEAVY_INDEX) return MOMENTS_FOR_ONE_WHO;
  const others = WHO_COUNT - 1;
  const rest = MOMENT_TOTAL - MOMENTS_FOR_ONE_WHO;
  const slot = index > MOMENT_HEAVY_INDEX ? index - 1 : index;
  return Math.floor(rest / others) + (slot < rest % others ? 1 : 0);
};

const whoKindOf = (index: number) =>
  index === 0 || index % 10 !== 3
    ? index % 15 === 7
      ? ('organization' as const)
      : ('person' as const)
    : ('pet' as const);

const nameOf = (index: number) => {
  if (index === 0) return 'Morgan';
  if (index === MOMENT_HEAVY_INDEX) return 'Avery Brooks';
  const first = FIRST_NAMES[index % 60];
  const last = LAST_NAMES[(7 * index + Math.floor(index / 60)) % 60];
  const kind = whoKindOf(index);
  if (kind === 'pet') return `${PET_NAMES[index % 10]} ${last}`;
  if (kind === 'organization') return `${last} ${ORG_KINDS[index % 8]}`;
  return `${first} ${last}`;
};

const MOMENT_KINDS: KeyDateSealed['kind'][] = [
  'met',
  'moved',
  'startedJob',
  'leftJob',
  'graduated',
  'adopted',
  'passedAway',
  'custom',
];
const MOMENT_LABELS = [
  'Ran a marathon',
  'Learned to sail',
  'Won the raffle',
  'First apartment',
  'Opened the shop',
];

/** A moment with a year a decade-first rule and a month or day only where its precision keeps one. */
const toMomentWords = (): KeyDateSealed => {
  const kind = pick(MOMENT_KINDS);
  const precision = pick(['day', 'month', 'year', 'decade'] as const);
  const rawYear = between(1985, new Date().getUTCFullYear() - 1);
  const year = precision === 'decade' ? Math.floor(rawYear / 10) * 10 : rawYear;
  return {
    kind,
    label: kind === 'custom' ? pick(MOMENT_LABELS) : null,
    month: precision === 'day' || precision === 'month' ? between(1, 12) : null,
    day: precision === 'day' ? between(1, 28) : null,
    year,
    precision,
    captureId: null,
  };
};

const toYearlyWords = (index: number, slot: number): KeyDateSealed => {
  const kind = whoKindOf(index);
  const base = {
    month: between(1, 12),
    day: between(1, 28),
    captureId: null,
    precision: null,
  };
  if (slot === 0)
    return {
      ...base,
      kind: 'birthday',
      label: null,
      year: random() < 0.3 ? null : between(1940, 2022),
    };
  if (kind === 'person')
    return {
      ...base,
      kind: 'anniversary',
      label: null,
      year: between(1990, 2024),
    };
  return {
    ...base,
    kind: 'custom',
    label: kind === 'pet' ? 'Gotcha day' : 'Opened',
    year: between(2005, 2024),
  };
};

/** Fixed offsets so dates spread across the last two years and the next one. */
const spreadDay = (now: number) => now + between(-730, 365) * DAY_MS;
const dayStart = (at: number) => Math.floor(at / DAY_MS) * DAY_MS;

/** Oversized sealed Helm fixture for Morgan, the site's scale account: a lifetime's volume of every list the app keeps, to judge Helm's speed. */
export async function seedHelmScale(context: SeedContext): Promise<SeedResult> {
  const startedAt = Date.now();
  const keyring = readEmulatorKeyring('HELM_MASTER_KEYS');
  const owner = FIXTURE_USERS.runwayScale;
  const uid = owner.uid;
  const now = context.now;
  const createdAt = now - 730 * DAY_MS;
  const data = deriveSeedDataKey(keyring, uid);
  const encryption: HelmEncryption = {
    appId: 'helm',
    keyId: data.keyId,
    keyVersion: 1,
    key: data.key.toString('hex'),
  };
  const seal = <T extends object>(fields: T) => sealJson<T>(fields, encryption);
  const root = `apps/helm/users/${uid}`;
  const pending: { path: string; value: object }[] = [];
  const counts: Record<string, number> = {};
  const put = (kind: string, path: string, value: object) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    pending.push({ path: `${root}/${path}`, value });
  };

  pending.push({
    path: `${root}`,
    value: {
      timeZone: OWNER_TIME_ZONE,
      assistantName: null,
      assistantTone: null,
      theme: null,
      dayStartTime: DEFAULT_DAY_START_TIME,
      dayEndTime: DEFAULT_DAY_END_TIME,
      planFillPercent: DEFAULT_PLAN_FILL_PERCENT,
      shiftCalendarIds: [],
      busyAllDayEventRefs: [],
      calendarOfferFoldedAt: null,
      hasSeenAiNotice: true,
      voiceMode: 'cloudWhenOnline',
      isWakeWordOn: false,
      isHandsFreeOn: true,
      hasSeenVoiceNotice: null,
      selfWhoId: 'self',
      currentPlace: null,
      styleLearnedThroughAt: null,
      conversationFreshAt: null,
      isDailyFreshOn: false,
      createdAt,
      lastEditedAt: null,
    },
  });
  counts.profile = 1;
  pending.push({
    path: wrappedKeyPath(uid),
    value: wrapDataKey(keyring, uid, data, createdAt),
  });
  Object.keys(keyring.keys).forEach((masterKeyId) =>
    pending.push({
      path: keyCheckPath(masterKeyId),
      value: makeKeyCheck(keyring, masterKeyId, createdAt),
    }),
  );
  counts.keys = 1 + Object.keys(keyring.keys).length;

  // Who, their dates that come back and their moments.
  const yearly: { id: string; whoId: string; words: KeyDateSealed }[] = [];
  const moments: { id: string; whoId: string; words: KeyDateSealed }[] = [];
  range(WHO_COUNT).forEach((index) => {
    const whoId = whoIdOf(index);
    range(YEARLY_PER_WHO).forEach((slot) =>
      yearly.push({
        id: `scale-date-${pad(index)}-${slot}`,
        whoId,
        words: toYearlyWords(index, slot),
      }),
    );
    range(momentsOf(index)).forEach((slot) =>
      moments.push({
        id: `scale-moment-${pad(index)}-${pad(slot, 3)}`,
        whoId,
        words: toMomentWords(),
      }),
    );
  });
  const photoColors: [number, number, number][] = [
    [226, 148, 72],
    [96, 130, 170],
    [120, 170, 110],
    [170, 110, 150],
    [200, 190, 90],
    [90, 160, 170],
  ];
  const photoPrototypes = await Promise.all(
    photoColors.map((color, index) =>
      buildSeedPhoto({
        uid,
        id: `scale-photo-prototype-${index}`,
        attachedTo: { kind: 'who', id: 'self' },
        color,
        now,
        encryption,
      }),
    ),
  );
  const whoDocs = await mapChunked(range(WHO_COUNT), async (index) => {
    const kind = whoKindOf(index);
    const name = nameOf(index);
    const photoIds = photoIdsOf(index);
    const who: Who = {
      ...toWho(
        {
          kind,
          tier: (['close', 'regular', 'passing'] as const)[index % 3],
          tierSetBy: index % 4 === 0 ? 'person' : 'nomos',
          isSelf: index === 0,
          createdBy: index % 4 === 0 ? 'person' : 'nomos',
          lastMentionedAt:
            index % 5 === 0 ? now - between(0, 700) * DAY_MS : null,
        },
        createdAt + index * 3 * MINUTE_MS,
        await seal<WhoSealed>(
          wordsOf(name, {
            aliases: index % 11 === 0 ? [name.split(' ')[0].toLowerCase()] : [],
            relation:
              kind === 'person' && index % 3 === 0
                ? RELATIONS[index % 8]
                : null,
            email:
              kind === 'person' && index % 4 === 1
                ? `${name.toLowerCase().replace(/ /g, '.')}@example.com`
                : null,
            species: kind === 'pet' ? SPECIES[index % 4] : null,
            organizationKind:
              kind === 'organization' ? ORG_KINDS[index % 8] : null,
          }),
        ),
      ),
      yearlyDateCount: YEARLY_PER_WHO,
      momentCount: momentsOf(index),
      photoMediaId: photoIds[0] ?? null,
      mediaIds: photoIds,
    };
    return { id: whoIdOf(index), who };
  });
  whoDocs.forEach((entry) => put('who', `who/${entry.id}`, entry.who));

  const toKeyDate =
    (shape: KeyDate['shape']) =>
    async (entry: { id: string; whoId: string; words: KeyDateSealed }) => ({
      id: entry.id,
      keyDate: {
        whoId: entry.whoId,
        shape,
        source: 'person',
        createdBy: 'person',
        executionId: null,
        createdAt: now - between(1, 700) * DAY_MS,
        lastEditedAt: null,
        sealed: await seal<KeyDateSealed>(entry.words),
      } satisfies KeyDate,
    });
  const yearlyDocs = await mapChunked(yearly, toKeyDate('yearly'));
  const momentDocs = await mapChunked(moments, toKeyDate('moment'));
  [...yearlyDocs, ...momentDocs].forEach((entry) =>
    put('keyDates', `keyDates/${entry.id}`, entry.keyDate),
  );
  const byWho = yearly.reduce<Record<string, KeyDateIndexEntry[]>>(
    (all, entry) => ({
      ...all,
      [entry.whoId]: [
        ...(all[entry.whoId] ?? []),
        [
          entry.id,
          entry.words.kind as KeyDateIndexEntry[1],
          entry.words.month as number,
          entry.words.day,
          entry.words.year,
          entry.words.kind === 'custom' ? entry.words.label : null,
        ],
      ],
    }),
    {},
  );
  const plan = planIndexWrite(byWho);
  const indexDocs = await Promise.all(
    plan.docs.map(async (entry) => ({
      id: entry.id,
      value: {
        entryCount: entry.entryCount,
        rebuiltAt: null,
        lastEditedAt: now,
        sealed: await seal({ byWho: entry.byWho }),
      },
    })),
  );
  indexDocs.forEach((entry) =>
    put('keyDateIndex', `meta/${entry.id}`, entry.value),
  );

  // Photos: six sealed pictures reused, one pair of Storage objects per medium.
  const mediaDocs = range(MEDIA_COUNT).map((index) => {
    const prototype = photoPrototypes[index % photoPrototypes.length];
    const id = `scale-media-${pad(index)}`;
    const media: Media = {
      ...prototype.media,
      attachedTo: [{ kind: 'who', id: whoIdOf(photoOwnerOf(index)) }],
      createdAt: now - between(1, 700) * DAY_MS,
    };
    return {
      id,
      media,
      uploads: [
        {
          path: getMediaObjectPath(uid, id, false),
          bytes: prototype.uploads[0].bytes,
        },
        {
          path: getMediaObjectPath(uid, id, true),
          bytes: prototype.uploads[1].bytes,
        },
      ],
    };
  });
  mediaDocs.forEach((entry) => put('media', `media/${entry.id}`, entry.media));

  // Projects and tasks.
  const projectIds = range(PROJECT_COUNT).map(
    (index) => `scale-project-${pad(index, 3)}`,
  );
  const projects = await Promise.all(
    projectIds.map(async (id, index) => {
      const isDone = index % 10 === 9;
      const finishedAt = isDone ? now - between(10, 300) * DAY_MS : null;
      const project: Project = {
        targetDate: isDone ? null : dayStart(now + between(5, 365) * DAY_MS),
        status: isDone ? 'finished' : 'active',
        milestoneState: {
          'm-1': { date: null, order: 0, doneAt: isDone ? finishedAt : null },
          'm-2': {
            date: dayStart(now + between(10, 300) * DAY_MS),
            order: 1,
            doneAt: null,
          },
        },
        whoRoles: {
          [whoIdOf(2 + index * 2)]: 'key',
          [whoIdOf(3 + index * 2)]: 'involved',
        },
        mediaIds: [],
        createdBy: 'person',
        executionId: null,
        createdAt: now - between(30, 700) * DAY_MS,
        lastEditedAt: null,
        finishedAt,
        sealed: await seal<ProjectSealed>({
          name: `${PROJECT_NAMES[index % 10]}${index >= 10 ? ` ${Math.floor(index / 10) + 1}` : ''}`,
          emoji: index % 3 === 0 ? '🛠️' : null,
          objective:
            index % 2 === 0 ? 'Get it done without a last-minute rush.' : null,
          milestones: {
            'm-1': { title: 'First stage' },
            'm-2': { title: 'Final stage' },
          },
          roleNotes: {},
        }),
      };
      return { id, project };
    }),
  );
  projects.forEach((entry) =>
    put('projects', `projects/${entry.id}`, entry.project),
  );

  const taskDocs = await mapChunked(range(TASK_COUNT), async (index) => {
    const isDone = index % 3 === 2;
    const dueDay = dayStart(spreadDay(now));
    const due: TaskDue | null =
      index % 4 === 3
        ? null
        : index % 5 === 0
          ? { kind: 'moment', at: dueDay + between(8, 18) * 3_600_000 }
          : { kind: 'day', date: dueDay };
    const hasProject = index % 2 === 0;
    const createdAt = now - between(1, 700) * DAY_MS;
    const task: Task = {
      status: isDone ? 'done' : 'open',
      importance: (['must', 'should', 'could', null] as const)[index % 4],
      isUrgent: index % 17 === 0,
      due,
      durationMinutes: index % 3 === 0 ? 15 * between(1, 8) : null,
      energy: (['low', 'medium', 'high', null] as const)[index % 4],
      context: (['atHome', 'out', 'atComputer', 'onPhone', null] as const)[
        index % 5
      ],
      projectId: hasProject ? projectIds[(index / 2) % PROJECT_COUNT] : null,
      milestoneId: hasProject && index % 4 === 0 ? 'm-1' : null,
      whoIds: index % 6 === 0 ? [whoIdOf(between(1, WHO_COUNT - 1))] : [],
      placeIds: [],
      notUntil: null,
      waitsOnTaskIds: [],
      waitsOnWhoId: null,
      stepState: {},
      mediaIds: [],
      createdBy: index % 2 === 0 ? 'person' : 'nomos',
      sourceCaptureId: null,
      executionId: null,
      createdAt,
      lastEditedAt: null,
      completedAt: isDone ? between(createdAt, now) : null,
      clearedAt: null,
      sealed: await seal<TaskSealed>({
        title: `${TASK_VERBS[index % 15]} ${TASK_OBJECTS[(index * 7 + Math.floor(index / 15)) % 20]}`,
        notes:
          index % 9 === 0 ? 'Ask for the earlier slot if there is one.' : null,
        steps: {},
      }),
    };
    return { id: `scale-task-${pad(index, 3)}`, task };
  });
  taskDocs.forEach((entry) => put('tasks', `tasks/${entry.id}`, entry.task));

  // Facts.
  const factDocs = await mapChunked(range(FACT_COUNT), async (index) => {
    const whoIndex = index % WHO_COUNT;
    const isConfirmed = index % 2 === 0;
    const createdAt = now - between(1, 700) * DAY_MS;
    const fact: Fact = {
      status: isConfirmed ? 'confirmed' : 'inferred',
      stated: isConfirmed ? 'personSaid' : 'nomosInferred',
      kind: (['world', 'preference', 'favorite', 'identity'] as const)[
        index % 4
      ],
      occurredOn: null,
      sourceCaptureId: null,
      sourceExecutionId: null,
      sourceConnection: null,
      aboutField: null,
      whoIds: [whoIdOf(whoIndex)],
      placeIds: [],
      projectIds: [],
      syncedIds: [],
      subjectIds: [whoIdOf(whoIndex)],
      keptOverSource: null,
      supersedesId: null,
      supersededById: null,
      supersededAt: null,
      disputedWithId: null,
      createdAt,
      confirmedAt: isConfirmed ? between(createdAt, now) : null,
      lastEditedAt: null,
      sealed: await seal<FactSealed>({
        statement: `${nameOf(whoIndex).split(' ')[0]} ${FACT_TEMPLATES[(index * 3 + Math.floor(index / 15)) % 15]}`,
        quote: null,
        topic: index % 4 === 1 ? 'coffee' : null,
        value: null,
      }),
    };
    return { id: `scale-fact-${pad(index)}`, fact };
  });
  factDocs.forEach((entry) => put('facts', `facts/${entry.id}`, entry.fact));

  // Topics: 8 roots, each with two children and each child with one more.
  const topicSpecs = range(TOPIC_ROOTS).flatMap((root) => {
    const rootId = `scale-topic-${pad(root, 2)}`;
    const children = range(2).map((child) => ({
      id: `${rootId}-${child}`,
      parentId: rootId,
      depth: 2 as const,
    }));
    return [
      { id: rootId, parentId: null, depth: 1 as const },
      ...children,
      ...children.map((entry) => ({
        id: `${entry.id}-0`,
        parentId: entry.id,
        depth: 3 as const,
      })),
    ];
  });
  const notesByTopic = range(NOTE_COUNT).reduce<Record<string, string[]>>(
    (all, index) => {
      if (index % 20 === 19) return all;
      const topicId = topicSpecs[index % topicSpecs.length].id;
      return {
        ...all,
        [topicId]: [...(all[topicId] ?? []), `scale-note-${pad(index, 3)}`],
      };
    },
    {},
  );
  const topicDocs = await Promise.all(
    topicSpecs.map(async (spec, index) => {
      const noteIds = notesByTopic[spec.id] ?? [];
      const name = TOPIC_NAMES[index];
      const sections: TopicSection[] = range(3).map((part) => ({
        id: `${spec.id}-section-${part}`,
        heading: ['Overview', 'What to remember', 'Next steps'][part],
        level: 1,
        markdown: `Everything kept about ${name.toLowerCase()}, part ${part + 1}: the small details that are easy to forget until the next time they matter.`,
        writtenBy: 'nomos',
        sources: noteIds
          .slice(part * 2, part * 2 + 2)
          .map((noteId) => ({ kind: 'note' as const, noteId })),
      }));
      const writtenAt = now - between(1, 300) * DAY_MS;
      const topic: Topic = {
        parentId: spec.parentId,
        depth: spec.depth,
        projectIds: [],
        version: 1,
        docState: 'current',
        pendingNoteIds: [],
        writeClaim: null,
        overviewOf: {},
        createdBy: 'person',
        executionId: null,
        createdAt: createdAt + index * DAY_MS,
        lastEditedAt: writtenAt,
        lastWrittenAt: writtenAt,
        sealed: await seal<TopicSealed>({
          name,
          emoji: null,
          overview: null,
          sections,
        }),
      };
      const version: TopicVersion = {
        version: 1,
        restoredFromVersion: null,
        createdBy: 'nomos',
        reason: 'firstWritten',
        noteIds,
        sourceCaptureId: null,
        executionId: null,
        createdAt: writtenAt,
        sealed: await seal<TopicVersionSealed>({
          sections,
          changeSummary: `Wrote the first version from ${noteIds.length} notes`,
          requestQuote: null,
          parentName: null,
        }),
      };
      return { id: spec.id, topic, version };
    }),
  );
  topicDocs.forEach((entry) => {
    put('topics', `topics/${entry.id}`, entry.topic);
    put('topicVersions', `topics/${entry.id}/versions/1`, entry.version);
  });
  const noteDocs = await mapChunked(range(NOTE_COUNT), async (index) => {
    const id = `scale-note-${pad(index, 3)}`;
    const topicId =
      index % 20 === 19 ? null : topicSpecs[index % topicSpecs.length].id;
    const subject = NOTE_SUBJECTS[(index * 5 + Math.floor(index / 14)) % 14];
    const note: Note = {
      topicIds: topicId ? [topicId] : [],
      source: 'typed',
      isFromGeneralAnswer: false,
      checkedAt: null,
      hasHealthCaution: false,
      sourceCaptureId: null,
      sourceMediaId: null,
      projectIds: [],
      createdBy: 'person',
      executionId: null,
      createdAt: now - between(1, 700) * DAY_MS,
      lastEditedAt: null,
      sealed: await seal<NoteSealed>({
        title: `Notes on ${subject} ${index + 1}`,
        body: `What worked last time for ${subject}: ${pick(FACT_TEMPLATES)}. Check again before the next ${pick(['season', 'trip', 'service', 'filing'])}.`,
      }),
    };
    return { id, note };
  });
  noteDocs.forEach((entry) => put('notes', `notes/${entry.id}`, entry.note));

  // Procedures and runs.
  const procedureSteps = (index: number) =>
    range(6 + (index % 5)).map((step) => ({
      id: `scale-step-${pad(index, 2)}-${step}`,
      text: `${pick(TASK_VERBS)} ${pick(TASK_OBJECTS)}`,
      groupId:
        step < 3
          ? null
          : step < 6
            ? `scale-group-${pad(index, 2)}-a`
            : `scale-group-${pad(index, 2)}-b`,
    }));
  const procedureDocs = await Promise.all(
    range(PROCEDURE_COUNT).map(async (index) => {
      const id = `scale-procedure-${pad(index, 2)}`;
      const steps = procedureSteps(index);
      const groups = [
        { id: `scale-group-${pad(index, 2)}-a`, name: 'Before' },
        { id: `scale-group-${pad(index, 2)}-b`, name: 'After' },
      ];
      const title = `${PROCEDURE_TITLES[index % 10]}${index >= 10 ? ` ${Math.floor(index / 10) + 1}` : ''}`;
      const stepState = toStepState(
        steps.map(({ id: stepId, groupId }) => ({ id: stepId, groupId })),
      );
      const body: ProcedureSealed = {
        title,
        steps: Object.fromEntries(
          steps.map((step) => [step.id, { text: step.text, detail: null }]),
        ),
        groups: Object.fromEntries(
          groups.map((group) => [group.id, { name: group.name }]),
        ),
      };
      const madeAt = now - between(30, 700) * DAY_MS;
      const procedure: Procedure = {
        stepState,
        groupOrder: groups.map((group) => group.id),
        version: 1,
        createdBy: 'person',
        sourceCaptureId: null,
        sourceTaskId: null,
        executionId: null,
        createdAt: madeAt,
        lastEditedAt: madeAt,
        sealed: await seal<ProcedureSealed>(body),
      };
      const version: ProcedureVersion = {
        version: 1,
        restoredFromVersion: null,
        createdBy: 'person',
        reason: 'created',
        stepState,
        groupOrder: procedure.groupOrder,
        sourceCaptureId: null,
        executionId: null,
        createdAt: madeAt,
        sealed: await seal<ProcedureVersionSealed>({
          ...body,
          changeSummary: '',
          requestQuote: null,
        }),
      };
      return { id, procedure, version, body, steps, groups };
    }),
  );
  procedureDocs.forEach((entry) => {
    put('procedures', `procedures/${entry.id}`, entry.procedure);
    put(
      'procedureVersions',
      `procedures/${entry.id}/versions/1`,
      entry.version,
    );
  });
  const runDocs = await Promise.all(
    range(RUN_COUNT).map(async (index) => {
      const source = procedureDocs[index % PROCEDURE_COUNT];
      const isOpen = index < OPEN_RUNS;
      const startedAt =
        now - (isOpen ? between(0, 5) : between(10, 700)) * DAY_MS;
      const finishedAt = isOpen ? null : startedAt + 60 * MINUTE_MS;
      const projectId =
        index % 3 === 0 ? projectIds[index % PROJECT_COUNT] : null;
      const run: ProcedureRun = {
        procedureId: source.id,
        procedureVersion: 1,
        attachedTo: projectId ? { kind: 'project', id: projectId } : null,
        dueOn: null,
        stepState: Object.fromEntries(
          source.steps.map((step, order) => [
            step.id,
            {
              order,
              groupId: step.groupId,
              doneAt: isOpen
                ? order < 2
                  ? startedAt + 5 * MINUTE_MS
                  : null
                : (finishedAt as number) - MINUTE_MS,
              isExtra: false,
            },
          ]),
        ),
        groupOrder: source.procedure.groupOrder,
        startedAt,
        finishedAt,
        createdBy: 'person',
        executionId: null,
        lastEditedAt: finishedAt ?? startedAt + 2 * MINUTE_MS,
        sealed: await seal<RunSealed>({
          ...source.body,
          attachedLabel: projectId ? PROJECT_NAMES[index % 10] : null,
        }),
      };
      return { id: `scale-run-${pad(index, 3)}`, run };
    }),
  );
  runDocs.forEach((entry) =>
    put('procedureRuns', `procedureRuns/${entry.id}`, entry.run),
  );

  // Turns: 400 typed messages across 60 sessions, every one already sorted and seen.
  const turnDocs = await mapChunked(range(TURN_COUNT), async (index) => {
    const session = Math.floor((index * SESSION_COUNT) / TURN_COUNT);
    const sessionStart =
      now - (SESSION_COUNT - 1 - session) * 11 * DAY_MS - HOUR_MS;
    const inSession = index - Math.ceil((session * TURN_COUNT) / SESSION_COUNT);
    const at = sessionStart + inSession * 4 * MINUTE_MS;
    const text = pick(TURN_TEXTS).replace(
      '%s',
      nameOf(between(1, WHO_COUNT - 1)).split(' ')[0],
    );
    const capture: Capture = {
      inputMode: 'typed',
      sttProvider: null,
      interruptedCaptureId: null,
      answersQuestion: null,
      ttsProvider: null,
      arrivedVia: 'direct',
      medium: 'web',
      via: null,
      sessionId: `scale-session-${pad(session, 2)}`,
      turnIndex: inSession,
      route: 'quick',
      status: 'sorted',
      heldReason: null,
      claimId: null,
      claimedAt: null,
      attempts: 1,
      lastErrorCode: null,
      questionState: {},
      executionIds: [],
      turnLeadId: null,
      joinedCaptureIds: [],
      attachmentIds: [],
      seenAt: at + MINUTE_MS,
      quotedSourceKeys: [],
      dismissedAt: null,
      answerSavedNoteId: null,
      whoIds: [],
      placeIds: [],
      createdAt: at,
      sortedAt: at + 4_000,
      planDayKey: null,
      screen: null,
      sealed: await seal<CaptureSealed>({
        text,
        reading: {
          people: [],
          places: [],
          documents: [],
          commands: [],
          isUrgent: false,
          dates: [],
          addressedAs: null,
        },
        answer: null,
        questionAnswer: null,
      }),
    };
    return { id: `scale-turn-${pad(index, 3)}`, capture };
  });
  turnDocs.forEach((entry) =>
    put('captures', `captures/${entry.id}`, entry.capture),
  );

  // Synced copies: 2,641 from five apps, with each app's grant counting what it holds.
  const sources = [
    { app: 'pinch', shares: PINCH_SHARES.shares },
    { app: 'a-list', shares: A_LIST_SHARES.shares },
    { app: 'waypoint', shares: WAYPOINT_SHARES.shares },
    { app: 'nine-lives', shares: NINE_LIVES_SHARES.shares },
    { app: 'runway', shares: RUNWAY_SHARES.shares },
  ].map(({ app, shares }) => {
    const connectorId = toAppConnectorId(app);
    return {
      connectorId,
      grantId: toGrantId('helm', connectorId, SITE_ACCOUNT_ID),
      shares,
    };
  });
  type Copy = {
    source: number;
    category: string;
    kind:
      'event' | 'task' | 'place' | 'trip' | 'pet' | 'moneySummary' | 'artifact';
    title: string;
    subtitle: string | null;
    startAt: number | null;
    endAt: number | null;
    isAllDay: boolean;
    dueAt: number | null;
    placeLabel: string | null;
    detail: string | null;
    amountCents: number | null;
    currency: string | null;
  };
  const SHARE_ARTIFACT_NAMES = {
    recipes: 'Recipe',
    pantryStock: 'Leftovers',
    savedMeals: 'Saved meal',
    envelopes: 'Envelope',
    tripChecklist: 'Trip: Packing',
  };
  const eventAt = () => spreadDay(now) + between(8, 21) * 3_600_000;
  const makeCopy = (
    source: number,
    category: string,
    kind: Copy['kind'],
    index: number,
  ): Copy => {
    const startAt = kind === 'event' || kind === 'trip' ? eventAt() : null;
    const isTask = kind === 'task';
    const title =
      category === 'moneySummary'
        ? 'Free to Spend'
        : category === 'plannedMeals'
          ? `${MEALS[index % 6]} ${index + 1}`
          : category === 'shoppingList'
            ? `${SHOPPING[index % 8]} ${index + 1}`
            : category === 'plannedShowings'
              ? `Showing ${index + 1}: ${pick(['Starlight Harbor', 'Galaxy Drift', 'Paper Moons', 'The Long Quiet'])}`
              : category === 'savedTheaters'
                ? `${THEATERS[index % 4]} ${index + 1}`
                : category === 'trips'
                  ? `${pick(SHARE_PLACES)} weekend ${index + 1}`
                  : category === 'itinerary'
                    ? `${pick(['Flight', 'Dinner', 'Tour', 'Check-in'])} ${index + 1}`
                    : category === 'myTasks'
                      ? `${pick(TASK_VERBS)} ${pick(TASK_OBJECTS)} ${index + 1}`
                      : category === 'recipes' ||
                          category === 'pantryStock' ||
                          category === 'savedMeals' ||
                          category === 'envelopes' ||
                          category === 'tripChecklist'
                        ? `${SHARE_ARTIFACT_NAMES[category]} ${index + 1}`
                        : category === 'cats'
                          ? `${PET_NAMES[index % 10]} ${index + 1}`
                          : `${PET_NAMES[index % 10]}: ${pick(['Advantage Multi', 'Heartgard', 'Nexgard'])} ${index + 1}`;
    return {
      source,
      category,
      kind,
      title,
      subtitle: null,
      startAt,
      endAt: startAt === null ? null : startAt + between(1, 3) * 3_600_000,
      isAllDay: kind === 'trip' || isTask,
      dueAt: isTask ? dayStart(spreadDay(now)) : null,
      placeLabel:
        kind === 'place' || kind === 'event' ? pick(SHARE_PLACES) : null,
      detail:
        kind === 'moneySummary'
          ? `Nothing is due before the next income on ${new Date(dayStart(now) + 3 * DAY_MS).toISOString().slice(0, 10)}`
          : null,
      amountCents: kind === 'moneySummary' ? 84_250 : null,
      currency: kind === 'moneySummary' ? 'USD' : null,
    };
  };
  const plans: [number, string, Copy['kind'], number][] = [
    [0, 'plannedMeals', 'event', 200],
    [0, 'shoppingList', 'task', 175],
    [0, 'recipes', 'artifact', 500],
    [0, 'pantryStock', 'artifact', 300],
    [0, 'savedMeals', 'artifact', 200],
    [1, 'plannedShowings', 'event', 250],
    [1, 'savedTheaters', 'place', 125],
    [2, 'trips', 'trip', 25],
    [2, 'itinerary', 'event', 250],
    [2, 'myTasks', 'task', 100],
    [2, 'tripChecklist', 'artifact', 40],
    [3, 'cats', 'pet', 25],
    [3, 'dueCare', 'task', 350],
    [4, 'moneySummary', 'moneySummary', 1],
    [4, 'envelopes', 'artifact', 100],
  ];
  const copies = plans.flatMap(([source, category, kind, count]) =>
    range(count).map((index) => makeCopy(source, category, kind, index)),
  );
  const syncedAt = now - 5 * MINUTE_MS;
  const copyDocs = copies.map((copy, index) => {
    const { grantId, connectorId } = sources[copy.source];
    const sourceRef = `${copy.category}/scale-${pad(index)}`;
    const id = createHash('sha256')
      .update(`${grantId}|${copy.category}|${sourceRef}`)
      .digest('hex')
      .slice(0, 40);
    return {
      id,
      value: {
        connectorId,
        accountId: SITE_ACCOUNT_ID,
        grantId,
        category: copy.category,
        kind: copy.kind,
        sourceRef,
        startAt: copy.startAt,
        endAt: copy.endAt,
        isAllDay: copy.isAllDay,
        dueAt: copy.dueAt,
        calendarKey: null,
        isBusy: null,
        sourceUpdatedAt: syncedAt - DAY_MS,
        contentHash: `scale-${id}`,
        syncedAt,
        transformVersion: 1,
        connectionEndedAt: null,
        deleteAfter: null,
        sealed: sealForHelm(
          { ...data, keyVersion: 1 },
          {
            title: copy.title,
            subtitle: copy.subtitle,
            detail: copy.detail,
            placeLabel: copy.placeLabel,
            amountCents: copy.amountCents,
            currency: copy.currency,
            deepLink: '/',
            extra: {},
          },
        ),
      },
    };
  });
  copyDocs.forEach((entry) => put('synced', `synced/${entry.id}`, entry.value));
  sources.forEach((source) => {
    const held = copies.filter(
      (copy) => copy.source === sources.indexOf(source),
    );
    const used = new Set(held.map((copy) => copy.category));
    const grant: ConnectionGrant = {
      readerAppId: 'helm',
      connectorId: source.connectorId,
      accountId: SITE_ACCOUNT_ID,
      categories: Object.fromEntries(
        source.shares.flatMap((share) =>
          share.categories.map((category) => [
            category.id,
            {
              isOn: used.has(category.id),
              changedAt: createdAt,
              seenScopeVersion: null,
            },
          ]),
        ),
      ),
      options: null,
      status: 'live',
      categoryState: Object.fromEntries(
        source.shares.flatMap((share) =>
          share.categories.map((category) => {
            const count = held.filter(
              (copy) => copy.category === category.id,
            ).length;
            return [
              category.id,
              { lastOkAt: syncedAt, lastError: null, count },
            ];
          }),
        ),
      ),
      errors: [],
      newCategoryIds: [],
      lastSyncAt: syncedAt,
      syncLeaseUntil: null,
      keptCopies: null,
      createdAt,
      updatedAt: createdAt,
      endedAt: null,
    };
    pending.push({
      path: `connections/${uid}/grants/${source.grantId}`,
      value: grant,
    });
  });
  counts.grants = sources.length;

  // The emulator commits one batch at a time, so the batches are written one after another once everything is built.
  await Array.from(
    { length: Math.ceil(pending.length / BATCH_SIZE) },
    (_, index) => pending.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  ).reduce(async (previous, slice) => {
    await previous;
    const batch = context.firestore.batch();
    slice.forEach(({ path, value }) =>
      batch.set(context.firestore.doc(path), value),
    );
    await batch.commit();
  }, Promise.resolve());

  const uploads = mediaDocs.flatMap((entry) => entry.uploads);
  await Array.from({ length: Math.ceil(uploads.length / 20) }, (_, index) =>
    uploads.slice(index * 20, (index + 1) * 20),
  ).reduce(async (previous, slice) => {
    await previous;
    await Promise.all(
      slice.map((upload) => uploadSealedSeed(upload.path, upload.bytes)),
    );
  }, Promise.resolve());

  console.log(
    `Helm scale for ${owner.label} (${uid}): ${Object.entries(counts)
      .map(([kind, count]) => `${count} ${kind}`)
      .join(
        ', ',
      )}, ${uploads.length} Storage objects, ${((Date.now() - startedAt) / 1000).toFixed(1)} s.`,
  );
  return { ...EMPTY_SEED_RESULT, firestoreDocuments: pending.length };
}
